import type { ActorRef, AuditEventType } from '@referralplatform/shared-types';

/**
 * Minimal structural type for "anything with an `auditOutbox.create` model
 * accessor" — satisfied by both `PrismaService` and the `tx` argument Prisma hands
 * to a `$transaction(async (tx) => ...)` callback, so `AuditOutboxService.enqueue()`
 * works inside a transaction or outside one.
 *
 * `args: any` rather than `unknown` is deliberate: this is a duck-typing bridge to
 * Prisma's generated client, and TypeScript's contravariant parameter checking means
 * a method accepting only `unknown` can never be structurally satisfied by Prisma's
 * narrower real signature.
 */
export interface AuditOutboxWriter {
  auditOutbox: {
    create: (args: any) => Promise<unknown>;
  };
}

export interface EnqueueAuditEventInput {
  type: AuditEventType;
  actor: ActorRef;
  subject: { type: string; id: string };
  payload: Record<string, unknown>;
  occurredAt?: Date;
}
