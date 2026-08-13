import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Body of `POST /concerns`. The three `isAbout*` fields are the
 * plain-language triage questions shown to the user — see triage.ts. There
 * is deliberately no `category` field: the UI never asks the user to
 * self-select a category.
 */
export class RaiseConcernDto {
  @IsString()
  @MinLength(1)
  patientId!: string;

  @IsOptional()
  @IsString()
  relatedReferralId?: string;

  @IsString()
  @MinLength(5)
  summary!: string;

  @IsBoolean()
  isAboutHowCareWasHandled!: boolean;

  @IsBoolean()
  isAboutSomethingNotWorkingOnThePlatform!: boolean;

  @IsBoolean()
  isAboutSomeoneSeeingSomethingTheyShouldnt!: boolean;

  /** GP to copy in, if this is a clinical-care concern the patient wants their GP kept in the loop on. */
  @IsOptional()
  @IsString()
  gpNotifiedId?: string;
}
