import type { ActorRef, AuditEventType } from '@referralplatform/shared-types';

/**
 * Minimal structural type for "anything with an `auditOutbox.create` model accessor" —
 * satisfied by both a service's `PrismaService` and the `tx` argument Prisma hands to a
 * `$transaction(async (tx) => ...)` callback, so `enqueueAuditEvent()` works inside a
 * transaction or outside one.
 *
 * `args: any` rather than `unknown` is deliberate and load-bearing: this is a
 * duck-typing bridge to each service's own generated Prisma client, and TypeScript's
 * contravariant parameter checking means a method declared to accept only `unknown`
 * can never be structurally satisfied by Prisma's narrower real signature.
 */
export interface AuditOutboxWriter {
  auditOutbox: {
    create: (args: any) => Promise<unknown>;
  };
}

/** The subset of a service's Prisma client the relay needs. Same duck-typing rationale. */
export interface AuditOutboxRelayClient {
  auditOutbox: {
    findMany: (args: any) => Promise<AuditOutboxRow[]>;
    update: (args: any) => Promise<unknown>;
  };
}

/**
 * A queued audit event. Deliberately loose about `actor`/`payload` (Prisma types these
 * as `JsonValue`, and each service generates its own client) — the relay only moves
 * them across the wire, it never inspects them.
 */
export interface AuditOutboxRow {
  id: string;
  type: string;
  actor: unknown;
  subjectType: string;
  subjectId: string;
  payload: unknown;
  occurredAt: Date;
  attempts: number;
}

export interface EnqueueAuditEventInput {
  type: AuditEventType;
  actor: ActorRef;
  subject: { type: string; id: string };
  payload: Record<string, unknown>;
  occurredAt?: Date;
}

/** Just the logging surface the relay uses — satisfied by NestJS's `Logger`. */
export interface RelayLogger {
  warn: (message: string) => void;
  error: (message: string) => void;
}
