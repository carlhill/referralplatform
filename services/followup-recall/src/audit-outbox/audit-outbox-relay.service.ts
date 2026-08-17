import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { AuditClient } from '@referralplatform/audit-client';
import type { ActorRef, AuditEventType } from '@referralplatform/shared-types';
import { createAuditClient } from '../common/clients';
import { PrismaService } from '../prisma/prisma.service';

interface OutboxRow {
  id: string;
  type: string;
  actor: unknown;
  subjectType: string;
  subjectId: string;
  payload: unknown;
  occurredAt: Date;
  publishedAt: Date | null;
  attempts: number;
  nextAttemptAt: Date | null;
}

const BATCH_SIZE = 25;

/**
 * Retry policy (uniform across every service's relay).
 *
 * There is no permanent give-up. Previously the four relays that tracked `attempts`
 * skipped a row forever once it hit `MAX_ATTEMPTS = 8`; at a 5s poll that is a
 * 40-second retry budget, which is less than the Audit Log Service takes to restart.
 * A routine deploy could therefore permanently strand audit records, and it did —
 * measured on 2026-08-17. The other seven relays had the opposite flaw: they retried
 * every 5s forever with no backoff and no record of the failure, hammering a service
 * that was already down and leaving nothing to diagnose afterwards.
 *
 * For an audit trail, retrying for hours must always beat discarding: a lost entry
 * breaks the platform's non-repudiation guarantee, whereas a late one does not. So a
 * failed row now backs off exponentially and keeps trying indefinitely.
 *
 * `attempts` and `lastError` are retained purely for diagnosis, and rows that have
 * been failing for a long time are logged at error level so they are visible without
 * anyone querying the table by hand.
 */
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60 * 1000;
/** Attempts after which a still-failing row is reported at error level rather than warn. */
const ESCALATE_AFTER_ATTEMPTS = 8;

function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_MAX_MS);
}

/**
 * The relay half of the outbox pattern — see
 * services/referral/src/audit-outbox/audit-outbox-relay.service.ts and
 * services/consent-security/src/audit-outbox/audit-outbox-relay.service.ts
 * for identical, more fully documented siblings. Every module in this
 * service writes an `AuditOutbox` row in the same DB transaction as its
 * domain write; this relay is the only thing that actually calls the Audit
 * Log Service.
 */
@Injectable()
export class AuditOutboxRelayService {
  private readonly logger = new Logger(AuditOutboxRelayService.name);
  private readonly auditClient: AuditClient;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.auditClient = createAuditClient(config);
  }

  @Interval(5000)
  async relayPending(): Promise<void> {
    const now = new Date();
    const pending = await this.prisma.auditOutbox.findMany({
      // No attempts cap: a row is eligible whenever its backoff window has elapsed,
      // so nothing is ever permanently skipped.
      where: {
        publishedAt: null,
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: { occurredAt: 'asc' },
      take: BATCH_SIZE,
    });

    for (const row of pending) {
      try {
        await this.auditClient.record({
          type: row.type as AuditEventType,
          actor: row.actor as unknown as ActorRef,
          subject: { type: row.subjectType, id: row.subjectId },
          payload: row.payload as Record<string, unknown>,
          occurredAt: row.occurredAt.toISOString(),
        });
        await this.prisma.auditOutbox.update({ where: { id: row.id }, data: { publishedAt: new Date() } });
      } catch (err) {
        const message = (err as Error).message ?? 'unknown error';
        const attempts = row.attempts + 1;
        const delay = backoffMs(attempts);
        await this.prisma.auditOutbox.update({
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
          // Still queued and still being retried - but it has been failing long
          // enough that someone should look at it.
          this.logger.error(`Persistently failing ${detail}`);
        } else {
          this.logger.warn(`Failed to relay ${detail}`);
        }
      }
    }
  }
}
