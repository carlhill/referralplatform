import type { ActorRef, AuditEventType } from '@referralplatform/shared-types';
import type { NotificationAuditEventType } from '../common/audit/notification-audit-events';

/**
 * Minimal structural type for "anything with an `auditOutbox.create` model
 * accessor" — satisfied by both `PrismaService` and the `tx` argument Prisma
 * hands to a `$transaction(async (tx) => ...)` callback, so
 * `AuditOutboxService.enqueue()` can be called from inside a transaction
 * (the whole point of the outbox pattern — see root CONVENTIONS.md §7) or
 * outside one.
 */
export interface AuditOutboxWriter {
  auditOutbox: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
}

export interface EnqueueAuditEventInput {
  /**
   * Either one of `packages/shared-types`' existing `AuditEventType` values,
   * or one of this service's local `NotificationAuditEventType` extensions
   * where it doesn't — see common/audit/notification-audit-events.ts for why
   * both are accepted here.
   */
  type: AuditEventType | NotificationAuditEventType;
  actor: ActorRef;
  subject: { type: string; id: string };
  payload: Record<string, unknown>;
  occurredAt?: Date;
}
