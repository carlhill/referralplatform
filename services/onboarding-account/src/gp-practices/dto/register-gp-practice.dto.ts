import { IsEmail, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { AUSTRALIAN_STATES } from '../../common/australian-state';

export const INTEGRATION_TIERS = ['A', 'B', 'C'] as const;
export type IntegrationTier = (typeof INTEGRATION_TIERS)[number];

/**
 * Practice-level registration, not individual GP self-signup — see
 * onboarding-processes.md ("Onboarding process — GP practice").
 */
export class RegisterGpPracticeDto {
  @IsString()
  @MinLength(1)
  practiceName!: string;

  @IsString()
  @Matches(/^\d{16}$/, { message: 'hpiO must be a 16-digit HPI-O' })
  hpiO!: string;

  @IsEmail()
  contactEmail!: string;

  @IsIn(AUSTRALIAN_STATES)
  state!: (typeof AUSTRALIAN_STATES)[number];

  /** A (structured booking, no deep integration) | B (secure-messaging connection) | C (native send button) — see onboarding-processes.md step 2. */
  @IsOptional()
  @IsIn(INTEGRATION_TIERS)
  integrationTier?: IntegrationTier;
}
