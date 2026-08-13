import { IsDateString, IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

/**
 * The GP-triggered "start a new patient account" request — module 1 of
 * business-process-flow.md. `triggeringGpHpiO` must belong to a
 * `GpPractice` that is verified and has acknowledged the compliance
 * checklist (enforced in onboarding.service.ts) — this is what makes "only
 * HPI-O/NASH-authenticated practice systems can trigger new patient
 * accounts" true, per onboarding-processes.md.
 *
 * `patientEmail` is required here even though production design sends the
 * activation *link* by SMS to `patientMobileNumber` — see
 * BUILD_LOG/onboarding-account.md for why this build (no SMS budget) treats
 * the email address the GP has on file as the delivery channel instead, and
 * why that substitution doesn't weaken the actual security property (the
 * DOB/Medicare shared-secret verification step, not the delivery channel,
 * is what binds whoever clicks the link to the real patient).
 */
export class CreateActivationRequestDto {
  @IsString()
  @MinLength(1)
  triggeringGpId!: string;

  @IsString()
  @Matches(/^\d{16}$/, { message: 'triggeringGpHpiO must be a 16-digit HPI-O' })
  triggeringGpHpiO!: string;

  @IsString()
  @MinLength(1)
  patientGivenName!: string;

  @IsString()
  @MinLength(1)
  patientFamilyName!: string;

  /** ISO date, e.g. 1990-05-12 — the DOB the GP already holds on file. */
  @IsDateString()
  patientDateOfBirth!: string;

  @IsString()
  @Matches(/^(\+?61|0)4\d{8}$/, { message: 'patientMobileNumber must be a valid Australian mobile number' })
  patientMobileNumber!: string;

  @IsEmail()
  patientEmail!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'patientMedicareNumber must be 10 digits' })
  patientMedicareNumber?: string;
}
