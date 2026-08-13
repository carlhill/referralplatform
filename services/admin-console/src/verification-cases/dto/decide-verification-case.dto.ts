import { IsOptional, IsString } from 'class-validator';

/** Body for approve/reject/needs-info — a free-text rationale, never required by the schema but strongly expected by policy. */
export class DecideVerificationCaseDto {
  @IsOptional()
  @IsString()
  decisionNote?: string;
}
