import type { AuditEventType } from '@referralplatform/shared-types';

/**
 * KNOWN GAP / documented judgment call (see BUILD_LOG/identity-access.md):
 * `packages/shared-types`' `AuditEventType` union (src/audit-event.ts) does
 * not yet include IAM/credential-security event types — only clinical and
 * consent-record event types (referral.*, consent.*, gp.link.*, ...). That
 * file's own doc comment says the right way to add one is "append, don't
 * repurpose an existing type" — but `packages/shared-types` is outside this
 * agent's assigned scope (`services/identity-access` only), so rather than
 * edit a shared package from here, this service defines its own local event
 * name constants and passes them to `AuditClient.record()` with an explicit,
 * narrow cast at the call site. The cast is safe at *runtime* (the Audit Log
 * Service accepts `type` as an opaque string over the wire — see
 * services/audit-log), it only widens what the *compiler* accepts. The
 * shared-types maintainer should fold these into the real union next time
 * that package is touched; do not repurpose an unrelated existing type
 * (e.g. 'access.request.granted') to avoid this cast — that would corrupt
 * audit-event semantics for every consumer of the audit log.
 *
 * These events are IAM/security events, not clinical-record or
 * consent-record writes, so per root CONVENTIONS.md §7 ("A direct
 * auditClient.record() call in the request path is acceptable ... for
 * genuinely non-clinical, non-consent events") they're written with a direct
 * call rather than the outbox pattern — there's no clinical-record
 * transaction they need to stay atomic with.
 */
export type IdentityAuditEventType =
  | 'identity.passkey.revoked'
  | 'identity.passkey.reenrolment_required'
  | 'identity.social_link.created'
  | 'identity.social_link.removed';

export function asAuditEventType(type: IdentityAuditEventType): AuditEventType {
  return type as unknown as AuditEventType;
}
