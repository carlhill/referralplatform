import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';

/**
 * Step 3 of identity-security-recommendations.md §3: "verify before asking
 * who's who" — the person who clicked the link supplies the DOB (and
 * Medicare number, if the GP captured one) the GP already has on file,
 * before anything about patient-vs-carer is asked.
 */
export class VerifyIdentityDto {
  @IsDateString()
  dateOfBirth!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'medicareNumber must be 10 digits' })
  medicareNumber?: string;
}
