import { IsIn, IsOptional } from 'class-validator';
import { PIPELINE_STAGES } from '../pipeline-stage';

export class ListPracticeOnboardingCasesQueryDto {
  @IsOptional()
  @IsIn(PIPELINE_STAGES)
  stage?: string;
}
