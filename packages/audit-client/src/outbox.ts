import type { ActorRef, AuditEventType } from '@referralplatform/shared-types';

/**
 * Shape of the `audit_outbox` table every service's Prisma schema should include
 * for clinical/consent-relevant writes (see root CONVENTIONS.md, "Audit outbox
 * convention", and audit-log-architecture-decision.md's "same transactional
 * boundary" requirement). This is a type-only helper — each service defines the
 * actual Prisma model, since Prisma doesn't share models across schemas.
 *
 * Suggested Prisma model (copy into your service's prisma/schema.prisma):
 *
 * ```prisma
 * model AuditOutbox {
 *   id          String   @id @default(uuid())
 *   type        String
 *   actor       Json
 *   subjectType String
 *   subjectId   String
 *   payload     Json
 *   occurredAt  DateTime @default(now())
 *   publishedAt DateTime?
 *   @@index([publishedAt])
 * }
 * ```
 */
export interface AuditOutboxRow {
  id: string;
  type: AuditEventType;
  actor: ActorRef;
  subjectType: string;
  subjectId: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  publishedAt: Date | null;
}
