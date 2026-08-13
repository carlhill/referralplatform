import { IsOptional, IsString } from 'class-validator';

export class DecisionReasonDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
