import { IsOptional, IsString, MinLength } from 'class-validator';

/** Query params for `GET /directory/pathway-suggestion`. */
export class SuggestPathwayQueryDto {
  @IsString()
  @MinLength(1)
  referralReason!: string;

  @IsOptional()
  @IsString()
  phnRegion?: string;
}
