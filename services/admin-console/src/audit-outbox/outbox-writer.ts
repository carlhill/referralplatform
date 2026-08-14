import type { ActorRef } from '@referralplatform/shared-types';

/** The minimal shape every module's Prisma transaction client needs for outbox writes. */
export interface OutboxTxClient {
  auditOutbox: {
    create: (args: any) => Promise<unknown>;
  };
}

/**
 * KNOWN GAP (see BUILD_LOG/admin-console.md): `@referralplatform/shared-types`'
 * `AuditEventType` union (packages/shared-types/src/audit-event.ts) has no
 * event types for this console's own actions — opening/deciding an
 * AHPRA/WWCC VerificationCase, or advancing a PracticeOnboardingCase stage.
 * `packages/shared-types` is outside this task's scope to edit (a shared
 * package, not `services/admin-console`). Recommended fix for whoever next
 * touches shared-types: append
 * `'verification_case.opened' | 'verification_case.approved' |
 * 'verification_case.rejected' | 'practice_onboarding_case.stage_advanced'`
 * to that union (append-only, per that file's own doc comment).
 *
 * Until then, `AdminConsoleEventType` is this service's own local
 * supplement to the same registry — every value written to the real Audit
 * Log Service via AuditOutboxRelayService is only ever cast to
 * `AuditEventType` at the network boundary (see relay.service.ts), which is
 * a widening-to-string cast (every literal here already IS a string) and is
 * genuinely inert at runtime — the Audit Log Service itself stores `type`
 * as a plain string column and its client-facing contract
 * (packages/audit-client) doesn't validate against the union either. This
 * is the same category of judgment call BUILD_LOG/consent-security.md
 * documents for its own "no matching event type yet" case.
 */
export type AdminConsoleEventType =
  | 'verification_case.opened'
  | 'verification_case.approved'
  | 'verification_case.rejected'
  | 'verification_case.needs_info'
  | 'practice_onboarding_case.opened'
  | 'practice_onboarding_case.stage_advanced'
  | 'access.request.granted'
  | 'access.request.denied';

export interface OutboxRowInput {
  type: AdminConsoleEventType;
  actor: ActorRef;
  subjectType: string;
  subjectId: string;
  payload: Record<string, unknown>;
}

/**
 * Shared helper for the outbox pattern (root CONVENTIONS.md §7) — every
 * module in this service (verification-cases, onboarding-pipeline) writes
 * through this instead of re-implementing the same `tx.auditOutbox.create(...)`
 * call shape independently. Mirrors
 * services/consent-security/src/audit-outbox/outbox-writer.ts.
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
