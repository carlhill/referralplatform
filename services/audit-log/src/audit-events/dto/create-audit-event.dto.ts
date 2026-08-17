import { Type } from 'class-transformer';
import { IsIn, IsISO8601, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import type { ActorRef, AuditEventType } from '@referralplatform/shared-types';

/**
 * Keep in sync with packages/shared-types/src/audit-event.ts's AuditEventType
 * union — class-validator needs a concrete runtime list, it can't validate
 * against a TS type. If you add an event type there, add it here too.
 */
export const AUDIT_EVENT_TYPES: AuditEventType[] = [
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
];

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
  @IsIn(AUDIT_EVENT_TYPES)
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
