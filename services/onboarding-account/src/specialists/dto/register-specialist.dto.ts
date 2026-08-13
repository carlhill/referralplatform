import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

/** See onboarding-processes.md ("Onboarding process — Specialist"). */
export class RegisterSpecialistDto {
  @IsString()
  @MinLength(1)
  givenName!: string;

  @IsString()
  @MinLength(1)
  familyName!: string;

  @IsEmail()
  contactEmail!: string;

  @IsString()
  @Matches(/^[A-Za-z]{3}\d{10}$/, { message: 'ahpraNumber must be in the format XXX0000000000 (e.g. MED0001234567)' })
  ahpraNumber!: string;
}
