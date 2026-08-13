import { IsIn, IsOptional, IsString } from 'class-validator';
import { PIPELINE_STAGES } from '../pipeline-stage';

export class AdvanceStageDto {
  @IsIn(PIPELINE_STAGES)
  toStage!: string;

  /** Set when advancing to 'registered' once the practice has a real onboarding-account GpPractice.id to link. */
  @IsOptional()
  @IsString()
  gpPracticeId?: string;

  @IsOptional()
  @IsString()
  integrationTier?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
