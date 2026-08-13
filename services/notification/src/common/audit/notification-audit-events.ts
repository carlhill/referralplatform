import type { AuditEventType } from '@referralplatform/shared-types';

/**
 * KNOWN GAP / documented judgment call (same pattern already used in
 * services/onboarding-account/src/common/audit/onboarding-audit-events.ts
 * and services/identity-access/src/common/audit/identity-audit-events.ts):
 * `packages/shared-types`' `AuditEventType` union (src/audit-event.ts) has
 * no event types at all for the referral-scoped secure message thread this
 * service owns. Per that file's own doc comment the correct fix is
 * additive ("append, don't repurpose an existing type"), but
 * `packages/shared-types` is outside this agent's assigned scope
 * (`services/notification` only) — so rather than edit a shared package
 * from here, this service defines its own local event-name constants and
 * passes them to `AuditClient.record()` with an explicit, narrow cast at
 * the call site (`asAuditEventType`). The cast is safe at *runtime* (the
 * Audit Log Service accepts `type` as an opaque string over the wire — see
 * services/audit-log) — it only widens what the *compiler* accepts. The
 * shared-types maintainer should fold these into the real union next time
 * that package is touched.
 *
 * Only message-thread events are listed here — routine push/SMS/email
 * delivery is NOT audited, per the task brief ("not the routine
 * notification delivery, which is high-volume and not audit-relevant").
 */
export type NotificationAuditEventType =
  | 'message_thread.created'
  | 'message_thread.message_posted'
  | 'message_thread.participant_added'
  | 'message_thread.resolved';

export function asAuditEventType(type: NotificationAuditEventType): AuditEventType {
  return type as unknown as AuditEventType;
}
