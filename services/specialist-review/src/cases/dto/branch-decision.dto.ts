import { IsIn, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

const BRANCHES = ['econsult', 'full_appointment'];

/**
 * Body of `POST /cases/:id/branch-decision` — module 5's "S2: Resolvable
 * via async advice (eConsult-style)?" fork. `adviceText` is required when
 * `branch === 'econsult'` (module 5's "S3: Specialist responds with advice
 * — full appointment avoided"); irrelevant otherwise.
 */
export class BranchDecisionDto {
  @IsIn(BRANCHES)
  branch!: 'econsult' | 'full_appointment';

  @ValidateIf((o) => o.branch === 'econsult')
  @IsString()
  @MinLength(1)
  adviceText?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
