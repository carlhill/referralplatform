import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PracticeLocationDto } from './practice-location.dto';

const CONSULTING_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/**
 * Body of `PUT /directory/entries/self` — a specialist (or internal staff on
 * their behalf) creating or updating their own directory profile. This
 * always supersedes any NHSD-synced copy for the same `hpiI` — see
 * DirectoryService.registerSelfProfile and modules-and-requirements.md.
 */
export class RegisterProfileDto {
  /** Healthcare Provider Identifier — Individual. 16 numeric digits (Healthcare Identifiers Service format). */
  @Matches(/^\d{16}$/, { message: 'hpiI must be 16 numeric digits' })
  hpiI!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsString()
  @MinLength(1)
  subspecialty!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PracticeLocationDto)
  practiceLocations!: PracticeLocationDto[];

  @IsArray()
  @IsIn(CONSULTING_DAYS, { each: true })
  consultingDays!: (typeof CONSULTING_DAYS)[number][];

  @IsOptional()
  @IsBoolean()
  econsultOptIn?: boolean;

  @IsOptional()
  @IsBoolean()
  acceptsBookingsViaPlatform?: boolean;

  /** Secure Messaging Gateway routing fields — see secure-messaging module. */
  @IsOptional()
  @IsBoolean()
  onboardedForDirectDelivery?: boolean;

  @IsOptional()
  @IsIn(['healthlink', 'medical_objects'])
  secureMessagingVendor?: 'healthlink' | 'medical_objects';

  @IsOptional()
  @IsString()
  secureMessagingEndpointId?: string;
}
