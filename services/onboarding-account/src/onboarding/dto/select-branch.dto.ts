import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const CARER_RELATIONSHIPS = [
  'parent_guardian',
  'adult_child',
  'spouse_partner',
  'professional_support_worker',
  'other',
] as const;
export type CarerRelationship = (typeof CARER_RELATIONSHIPS)[number];

/**
 * Carer detail capture — identity-security-recommendations.md §3 step 6:
 * name, email, relationship, and whether the carer has their own mobile
 * number independent of the patient's.
 */
export class CarerDetailsDto {
  @IsString()
  @MinLength(1)
  givenName!: string;

  @IsString()
  @MinLength(1)
  familyName!: string;

  @IsEmail()
  email!: string;

  @IsIn(CARER_RELATIONSHIPS)
  relationship!: CarerRelationship;

  @IsBoolean()
  sharesPatientMobileNumber!: boolean;

  /** Required when sharesPatientMobileNumber is false; ignored otherwise. */
  @ValidateIf((o: CarerDetailsDto) => o.sharesPatientMobileNumber === false)
  @IsString()
  @Matches(/^(\+?61|0)4\d{8}$/, { message: 'ownMobileNumber must be a valid Australian mobile number' })
  ownMobileNumber?: string;
}

/**
 * The carer-vs-patient branch question, asked neutrally after identity
 * verification — identity-security-recommendations.md §3 step 4.
 */
export class SelectBranchDto {
  @IsEnum(['patient', 'carer'] as const)
  role!: 'patient' | 'carer';

  @ValidateIf((o: SelectBranchDto) => o.role === 'carer')
  @ValidateNested()
  @Type(() => CarerDetailsDto)
  carer?: CarerDetailsDto;
}
