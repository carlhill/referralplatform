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
