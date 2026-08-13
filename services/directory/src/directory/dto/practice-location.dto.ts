import { IsIn, IsString, Matches, MinLength } from 'class-validator';
import type { AustralianState } from '@referralplatform/shared-types';

const AU_STATES: AustralianState[] = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

export class PracticeLocationDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  suburb!: string;

  @IsIn(AU_STATES)
  state!: AustralianState;

  @Matches(/^\d{4}$/, { message: 'postcode must be 4 digits' })
  postcode!: string;
}
