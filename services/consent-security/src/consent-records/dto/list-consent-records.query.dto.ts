import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { CONSENT_SUBJECT_TYPES, type ConsentSubjectType } from '../consent-subject-type';

export class ListConsentRecordsQueryDto {
  @IsString()
  @MinLength(1)
  patientId!: string;

  @IsOptional()
  @IsIn(CONSENT_SUBJECT_TYPES)
  subjectType?: ConsentSubjectType;
}
