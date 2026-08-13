import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * Per modules-and-requirements.md ("Compliance Rules Engine" /
 * onboarding-processes.md step 5): "the practice should formally
 * acknowledge this is decision support, not a legal certification, before
 * it's switched on for their referrals."
 */
export class AcknowledgeComplianceChecklistDto {
  @IsString()
  @MinLength(1)
  acknowledgedByName!: string;

  @IsEmail()
  acknowledgedByEmail!: string;
}
