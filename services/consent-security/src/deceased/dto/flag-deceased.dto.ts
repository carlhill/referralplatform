import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const AUSTRALIAN_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const;

/** Body of `POST /deceased-flags` — the GP-triggered first-notice point per complaints-continuity-deceased.md section 3. */
export class FlagDeceasedDto {
  @IsString()
  @MinLength(1)
  patientId!: string;

  @IsString()
  @MinLength(1)
  flaggedByGpId!: string;

  /** The treating GP's state — keys the executor/family/coroner access rule (see state-eligibility.ts). */
  @IsIn(AUSTRALIAN_STATES)
  state!: (typeof AUSTRALIAN_STATES)[number];

  @IsOptional()
  @IsString()
  reason?: string;
}
