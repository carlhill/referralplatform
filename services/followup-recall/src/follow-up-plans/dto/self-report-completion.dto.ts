import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The self-report fallback — business-process-flow.md module 6: "Test
 * completed? ... Patient self-reports -> Follow-up Plan marked complete."
 * `reportedBy` is deliberately narrower than every `PrincipalType` (no
 * `internal_staff`/`system`/`specialist`) — self-report is specifically the
 * patient/carer/GP-attests-on-patient's-behalf fallback path, not a generic
 * "mark complete" escape hatch; automatic detection and staff-assisted
 * correction are separate, already-authenticated flows.
 */
export class SelfReportCompletionDto {
  @IsIn(['patient', 'carer', 'gp'])
  reportedBy!: 'patient' | 'carer' | 'gp';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
