import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { VERIFICATION_CASE_TYPES, type VerificationCaseType } from '../verification-case-types';

/**
 * KNOWN GAP (see BUILD_LOG/admin-console.md and
 * src/common/onboarding-account.client.ts's own doc comment): onboarding-
 * account exposes no list/"pending verification" discovery endpoint, so
 * staff open a case using an identifier they already have (from a support
 * ticket, or an ahpra_verification_failed/hpio_verification_failed audit
 * event they were alerted to out-of-band) rather than this console
 * surfacing a queue of what needs review on its own.
 */
export class OpenVerificationCaseDto {
  @IsIn(VERIFICATION_CASE_TYPES)
  caseType!: VerificationCaseType;

  /** 'Specialist' | 'GpPractice' — omitted for wwcc cases (no source-service record to snapshot). */
  @IsOptional()
  @IsString()
  entityType?: string;

  /** onboarding-account's Specialist.id or GpPractice.id — omitted for wwcc cases. */
  @IsOptional()
  @IsString()
  entityId?: string;

  @IsString()
  @MinLength(1)
  subjectName!: string;

  /** AHPRA number / HPI-O / WWCC check number, as applicable. */
  @IsOptional()
  @IsString()
  subjectIdentifier?: string;

  /** AustralianState — the issuing state for a wwcc check. */
  @IsOptional()
  @IsString()
  issuingState?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
