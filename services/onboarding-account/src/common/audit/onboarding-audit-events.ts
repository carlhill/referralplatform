import type { AuditEventType } from '@referralplatform/shared-types';

/**
 * KNOWN GAP / documented judgment call (see BUILD_LOG/onboarding-account.md,
 * following the same pattern already used in
 * services/identity-access/src/common/audit/identity-audit-events.ts):
 * `packages/shared-types`' `AuditEventType` union (src/audit-event.ts)
 * already covers most of this service's events (`account.activation.requested`,
 * `account.activated`, `carer.registered`, `carer.reattested`) but is missing
 * several this service genuinely needs (identity-verification/OTP outcomes,
 * GP-practice and specialist onboarding lifecycle events). Per that file's
 * own doc comment the correct fix is additive ("append, don't repurpose an
 * existing type"), but `packages/shared-types` is outside this agent's
 * assigned scope (`services/onboarding-account` only) — so rather than edit
 * a shared package from here, or repurpose an unrelated existing type (which
 * would corrupt audit-event semantics for every consumer of the audit log),
 * this service defines its own local event-name constants and passes them to
 * `AuditClient.record()` with an explicit, narrow cast at the call site. The
 * cast is safe at *runtime* (the Audit Log Service accepts `type` as an
 * opaque string over the wire — see services/audit-log) — it only widens
 * what the *compiler* accepts. The shared-types maintainer should fold these
 * into the real union next time that package is touched.
 */
export type OnboardingAuditEventType =
  | 'account.activation.link.sent'
  | 'account.activation.link.expired'
  | 'account.activation.identity_verified'
  | 'account.activation.identity_verification_failed'
  | 'account.activation.identity_locked'
  | 'account.activation.branch_selected'
  | 'account.otp.sent'
  | 'account.otp.verified'
  | 'account.otp.failed'
  | 'account.otp.locked'
  | 'account.passkey_enrolment.prompted'
  | 'account.passkey_enrolment.prompt_failed'
  | 'carer.email_verified'
  | 'carer.suspected_organisational'
  | 'gp_practice.registration_requested'
  | 'gp_practice.hpio_verified'
  | 'gp_practice.hpio_verification_failed'
  | 'gp_practice.compliance_checklist_acknowledged'
  | 'specialist.registration_requested'
  | 'specialist.ahpra_verified'
  | 'specialist.ahpra_verification_failed'
  | 'specialist.hpii_resolved'
  | 'specialist.nash_credential_provisioned'
  | 'specialist.directory_profile_created'
  | 'specialist.directory_profile_creation_failed'
  | 'specialist.econsult_opt_in_changed';

export function asAuditEventType(type: OnboardingAuditEventType): AuditEventType {
  return type as unknown as AuditEventType;
}
