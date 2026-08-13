import type { ActorRef, AuditEventType } from '@referralplatform/shared-types';

/** The minimal shape every module's Prisma transaction client needs for outbox writes. */
export interface OutboxTxClient {
  auditOutbox: {
    create: (args: unknown) => Promise<unknown>;
  };
}

export interface OutboxRowInput {
  type: AuditEventType;
  actor: ActorRef;
  subjectType: string;
  subjectId: string;
  payload: Record<string, unknown>;
}

/**
 * Shared helper for the outbox pattern (root CONVENTIONS.md §7) — every
 * module in this service (consent-records, reattestations, concerns,
 * deceased) writes through this instead of re-implementing the same
 * `tx.auditOutbox.create(...)` call shape independently.
 */
export async function writeOutbox(tx: OutboxTxClient, row: OutboxRowInput): Promise<void> {
  await tx.auditOutbox.create({
    data: {
      type: row.type,
      actor: row.actor as unknown as object,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      payload: row.payload as unknown as object,
    },
  });
}
