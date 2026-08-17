import { Type } from 'class-transformer';
import { IsIn, IsISO8601, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import type { ActorRef, AuditEventType } from '@referralplatform/shared-types';

/**
 * Runtime counterpart of `packages/shared-types`' `AuditEventType` union —
 * class-validator needs a concrete list, it can't validate against a TS type.
 *
 * These two MUST stay identical, and the assertions below the array enforce it at
 * compile time (see also audit-event-types.contract.spec.ts). This used to be a
 * "keep in sync" comment and nothing else, and it drifted twice in one day with the
 * same result both times — **silent data loss**:
 *   - ten types emitted by onboarding-account/admin-console were missing here, so
 *     every one was rejected with 400 and retried until it hit the outbox attempts
 *     cap, meaning OTP issuance and HPI-O verification were never recorded;
 *   - four `identity.*` types from identity-access were missing too, and because
 *     that service writes directly rather than via an outbox, those were dropped
 *     outright — passkey revocations included.
 * A drifted whitelist does not fail loudly anywhere; it just quietly stops recording
 * events. Hence a compile-time contract rather than another comment.
 */
export const AUDIT_EVENT_TYPES = [
  'account.activation.requested',
  'account.activated',
  'carer.registered',
  'carer.reattested',
  'gp.linked',
  'gp.link.requested',
  'gp.link.declined',
  'gp.link.revoked',
  'referral.created',
  'referral.queued',
  'referral.lapsed',
  'referral.routed',
  'referral.declined',
  'referral.cancelled',
  'consent.granted',
  'consent.revoked',
  'booking.confirmed',
  'booking.cancelled',
  'followup.plan.created',
  'followup.plan.completed',
  'followup.reminder.suppressed',
  'concern.raised',
  'concern.resolved',
  'patient.deceased.flagged',
  'access.request.granted',
  'access.request.denied',
  // Emitted by onboarding-account and admin-console but missing from this list,
  // so every one was rejected with 400 and retried forever in the producer's
  // outbox — exactly the drift this file's header comment warns about. Keep in
  // sync with packages/shared-types/src/audit-event.ts.
  'account.activation.branch_selected',
  'account.activation.identity_verified',
  'account.otp.sent',
  'account.otp.verified',
  'account.passkey_enrolment.prompt_failed',
  'gp_practice.registration_requested',
  'gp_practice.hpio_verified',
  'gp_practice.hpio_verification_failed',
  'gp_practice.compliance_checklist_acknowledged',
  'practice_onboarding_case.opened',
  // IAM/credential-security events from identity-access — see the note in
  // packages/shared-types/src/audit-event.ts. Keep in sync with that union.
  'identity.passkey.revoked',
  'identity.passkey.reenrolment_required',
  'identity.social_link.created',
  'identity.social_link.removed',
  'identity.bootstrap_password.removed',
] as const;

/** The literal union of what this whitelist actually contains, for the checks below. */
type WhitelistedEventType = (typeof AUDIT_EVENT_TYPES)[number];

/**
 * Direction 1 — nothing in the whitelist that isn't a real `AuditEventType`.
 * A typo'd or invented entry here would let a producer write an event type no
 * consumer of the audit log understands.
 */
const _noUnknownTypes: readonly AuditEventType[] = AUDIT_EVENT_TYPES;
void _noUnknownTypes;

/**
 * Direction 2 — nothing in the union missing from the whitelist. This is the one
 * that keeps biting: a producer adds an event type to shared-types, ships it, and
 * the Audit Log Service silently 400s every write.
 *
 * If they drift, this line fails to compile and the error names the missing members
 * (e.g. `Type 'true' is not assignable to ... missing: "identity.passkey.revoked"`),
 * so `npm run build` — and therefore the Docker build — fails rather than the gap
 * reaching production.
 */
type MissingFromWhitelist = Exclude<AuditEventType, WhitelistedEventType>;
const _noMissingTypes: [MissingFromWhitelist] extends [never]
  ? true
  : { ERROR: 'AuditEventType members are missing from AUDIT_EVENT_TYPES'; missing: MissingFromWhitelist } = true;
void _noMissingTypes;

const PRINCIPAL_TYPES = ['patient', 'carer', 'gp', 'specialist', 'internal_staff', 'system'] as const;

export class ActorRefDto implements ActorRef {
  @IsIn(PRINCIPAL_TYPES)
  principalType!: ActorRef['principalType'];

  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  healthcareIdentifier?: ActorRef['healthcareIdentifier'];

  @IsOptional()
  @IsString()
  displayName?: string;
}

export class SubjectRefDto {
  @IsString()
  type!: string;

  @IsString()
  id!: string;
}

export class CreateAuditEventDto {
  // Spread into a mutable array: AUDIT_EVENT_TYPES is `as const` (readonly) so the
  // compile-time contract above can see its literal members.
  @IsIn([...AUDIT_EVENT_TYPES])
  type!: AuditEventType;

  @ValidateNested()
  @Type(() => ActorRefDto)
  actor!: ActorRefDto;

  @ValidateNested()
  @Type(() => SubjectRefDto)
  subject!: SubjectRefDto;

  /**
   * Minimum necessary structured data for this event. Put any field that
   * shouldn't be stored in cleartext under `payload.sensitive` — see
   * crypto-shredding/crypto-shredding.service.ts's doc comment for the
   * convention this service enforces.
   */
  @IsObject()
  payload!: Record<string, unknown>;

  /** Defaults to server-now if omitted. */
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}
