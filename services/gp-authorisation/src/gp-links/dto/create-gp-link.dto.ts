import { IsBoolean, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

/**
 * Body of `POST /gp-links` — called by an HPI-O/NASH-authenticated practice
 * system (see HpioNashAuthGuard), never directly by a patient/carer client.
 */
export class CreateGpLinkDto {
  @IsString()
  @MinLength(1)
  patientId!: string;

  @IsString()
  @MinLength(1)
  gpId!: string;

  @IsString()
  @MinLength(1)
  practiceHpiO!: string;

  /**
   * Urgent-bypass escalation — see minors-multigp-exception-paths.md section 3
   * ("an urgent-case escalation option ... use the urgent-bypass path") and
   * BUILD_LOG/gp-authorisation.md for the judgment call on exactly what this
   * does: the link is auto-approved immediately (so the GP can create the
   * referral without waiting on patient response) but flagged for the
   * patient's retrospective review/revoke on the consent page, and audited
   * with elevated visibility.
   */
  @IsOptional()
  @IsBoolean()
  urgentEscalation?: boolean;

  /** Required (validated in GpLinksService, not here) when urgentEscalation is true. */
  @ValidateIf((o) => o.urgentEscalation === true)
  @IsString()
  @MinLength(1)
  urgentJustification?: string;
}
