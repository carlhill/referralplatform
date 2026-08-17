import type { AuditEventType } from '@referralplatform/shared-types';

/**
 * RESOLVED 2026-08-17. This file previously carried a documented judgment call:
 * because `packages/shared-types` was outside the original agent's scope, these
 * IAM event names were declared locally and force-cast to `AuditEventType`, on
 * the stated assumption that "the Audit Log Service accepts `type` as an opaque
 * string over the wire".
 *
 * **That assumption was wrong.** `services/audit-log`'s `CreateAuditEventDto`
 * validates `type` with `@IsIn(AUDIT_EVENT_TYPES)` — a strict runtime whitelist.
 * Every event written from this service was therefore rejected with 400. And
 * because these are deliberately *direct* `auditClient.record()` calls rather
 * than outbox-backed writes (see below), a rejection meant the event was dropped
 * outright, with no retry and no stored row — so passkey revocations and social
 * -link changes, which are exactly the security events you would want during an
 * incident review, were never recorded at all.
 *
 * The names are now real members of the shared union and of audit-log's runtime
 * whitelist, so the cast below is a formality kept only to avoid churning call
 * sites. When adding a new one, add it in all three places.
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
  | 'identity.social_link.removed'
  | 'identity.bootstrap_password.removed';

export function asAuditEventType(type: IdentityAuditEventType): AuditEventType {
  return type as unknown as AuditEventType;
}
