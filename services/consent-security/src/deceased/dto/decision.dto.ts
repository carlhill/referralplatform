import { IsOptional, IsString } from 'class-validator';

export class AccessRequestDecisionDto {
  @IsOptional()
  @IsString()
  decisionNote?: string;
}
