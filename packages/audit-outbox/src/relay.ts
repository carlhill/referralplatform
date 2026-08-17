import type { AuditClient } from '@referralplatform/audit-client';
import type { ActorRef, AuditEventType } from '@referralplatform/shared-types';
import type { AuditOutboxRelayClient, AuditOutboxWriter, EnqueueAuditEventInput, RelayLogger } from './types';

export const DEFAULT_BATCH_SIZE = 25;

/**
 * Retry policy — see `relayPendingAuditEvents` for why it is shaped this way.
 * Exported so a service can reason about (or test against) the real numbers rather
 * than hard-coding its own copy, which is how these drifted in the first place.
 */
export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 5 * 60 * 1000;
/** Attempts after which a still-failing row is reported at error level rather than warn. */
export const ESCALATE_AFTER_ATTEMPTS = 8;

export function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_MAX_MS);
}

/**
 * Writes an `AuditOutbox` row.
 *
 * @param writer a service's `PrismaService` for a standalone call, or the `tx`
 *   argument of a `$transaction(async (tx) => ...)` callback to enqueue the audit row
 *   in the *same* transaction as the domain write it documents — always prefer the
 *   latter for anything that must never be silently lost.
 */
export async function enqueueAuditEvent(writer: AuditOutboxWriter, input: EnqueueAuditEventInput): Promise<void> {
  await writer.auditOutbox.create({
    data: {
      type: input.type,
      actor: input.actor as unknown as Record<string, unknown>,
      subjectType: input.subject.type,
      subjectId: input.subject.id,
      payload: input.payload,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
}

export interface RelayOptions {
  prisma: AuditOutboxRelayClient;
  auditClient: AuditClient;
  logger: RelayLogger;
  batchSize?: number;
}

/**
 * Publishes one batch of queued audit events to the Audit Log Service.
 *
 * THE RETRY POLICY, AND WHY IT IS WHAT IT IS. This logic used to be copy-pasted into
 * every service's relay, and the copies drifted into two different broken policies
 * without anyone noticing:
 *
 *   - Some capped at 8 attempts and then skipped a row *permanently*. At a 5-second
 *     poll that is a 40-second retry budget — less than the Audit Log Service takes to
 *     restart — so an ordinary deploy could destroy audit records. Measured on
 *     2026-08-17, not theorised.
 *   - The rest retried every 5 seconds forever with no backoff and no failure
 *     bookkeeping, hammering a service that was already down and leaving nothing to
 *     diagnose afterwards.
 *
 * So: exponential backoff, and **no permanent give-up**. A row that keeps failing is
 * reported at error level once it passes `ESCALATE_AFTER_ATTEMPTS`, but it stays
 * queued and keeps being retried. `attempts`/`lastError` exist purely for diagnosis.
 * The judgment underneath: for an audit trail a late entry does not break
 * non-repudiation, whereas a lost one does — so retrying for hours must always beat
 * discarding. Do not reintroduce a give-up threshold here without deciding, explicitly
 * and in writing, that losing audit events is acceptable.
 *
 * Framework-agnostic on purpose: scheduling, dependency injection and the
 * skip-if-already-running guard stay in each service's thin NestJS wrapper, so this
 * package needs no NestJS dependency and stays directly unit-testable.
 */
export async function relayPendingAuditEvents(options: RelayOptions): Promise<void> {
  const { prisma, auditClient, logger, batchSize = DEFAULT_BATCH_SIZE } = options;
  const now = new Date();

  const pending = await prisma.auditOutbox.findMany({
    // No attempts cap: a row is eligible once its backoff window has elapsed, so
    // nothing is ever permanently skipped. `nextAttemptAt: null` is the state every
    // freshly-enqueued row starts in, i.e. eligible immediately.
    where: {
      publishedAt: null,
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { occurredAt: 'asc' },
    take: batchSize,
  });

  for (const row of pending) {
    try {
      await auditClient.record({
        type: row.type as AuditEventType,
        actor: row.actor as ActorRef,
        subject: { type: row.subjectType, id: row.subjectId },
        payload: row.payload as Record<string, unknown>,
        occurredAt: row.occurredAt.toISOString(),
      });
      await prisma.auditOutbox.update({
        where: { id: row.id },
        data: { publishedAt: new Date() },
      });
    } catch (err) {
      const message = (err as Error).message ?? 'unknown error';
      const attempts = row.attempts + 1;
      const delay = backoffMs(attempts);

      await prisma.auditOutbox.update({
        where: { id: row.id },
        data: {
          attempts: { increment: 1 },
          lastError: message.slice(0, 500),
          nextAttemptAt: new Date(Date.now() + delay),
        },
      });

      const detail = `audit outbox row ${row.id} (${row.type}) failed attempt ${attempts}, retrying in ${Math.round(
        delay / 1000,
      )}s: ${message}`;
      if (attempts >= ESCALATE_AFTER_ATTEMPTS) {
        // Still queued and still being retried — but failing long enough that
        // someone should look at it.
        logger.error(`Persistently failing ${detail}`);
      } else {
        logger.warn(`Failed to relay ${detail}`);
      }
    }
  }
}
