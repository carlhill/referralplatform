import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Body of `POST /cases/:id/extractions/:extractionId/confirm`.
 *
 * `confirmed` must be the literal `true` — a deliberate explicit-confirmation
 * gate, not a rubber-stamp default, per module #10's "the specialist must
 * explicitly confirm before anything downstream happens" requirement and the
 * Babylon Health cautionary guardrail (patient-centered-recall-ai-intake.md).
 * There is no "confirm all extractions by default" endpoint anywhere in this
 * service — every confirmation is one deliberate call naming one specific
 * ExtractionResult id.
 *
 * `edits` records whatever the specialist corrected in the AI's output,
 * stored separately from the original `structuredData` (see
 * ExtractionResult's schema doc comment) so the audit trail can always
 * distinguish "what the AI produced" from "what the human actually
 * confirmed was accurate".
 */
export class ConfirmExtractionDto {
  @IsIn([true])
  confirmed!: true;

  @IsOptional()
  @IsObject()
  edits?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  note?: string;
}
