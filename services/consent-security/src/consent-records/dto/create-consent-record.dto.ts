import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import {
  CONSENT_SUBJECT_TYPES,
  SENSITIVE_CATEGORIES,
  type ConsentSubjectType,
  type SensitiveCategory,
} from '../consent-subject-type';

/**
 * Body of `POST /consent-records`. Deliberately excludes the
 * `referral_visibility` subjectType — that has its own, higher-level API
 * (`POST /consent/referral-visibility`, see referral-visibility.controller.ts)
 * so callers don't have to know the composite subjectId convention.
 */
export class CreateConsentRecordDto {
  @IsString()
  @MinLength(1)
  patientId!: string;

  @IsIn(CONSENT_SUBJECT_TYPES.filter((t) => t !== 'referral_visibility'))
  subjectType!: Exclude<ConsentSubjectType, 'referral_visibility'>;

  @IsString()
  @MinLength(1)
  subjectId!: string;

  @IsOptional()
  @IsIn(SENSITIVE_CATEGORIES)
  sensitiveCategory?: SensitiveCategory;
}
