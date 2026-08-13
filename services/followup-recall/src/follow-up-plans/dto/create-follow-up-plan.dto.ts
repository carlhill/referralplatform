import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { FOLLOW_UP_REFERRAL_TYPES, type FollowUpReferralType } from '../follow-up-plan-status';

/**
 * The specialist's structured Follow-up Plan — business-process-flow.md
 * module 6: "next review date, required tests, referral type". `referralId`
 * links back to the Referral Service's record (never re-validated here per
 * root CONVENTIONS.md §6 — a service never reads another service's schema
 * directly; the caller, Specialist Review / the specialist portal, is
 * trusted to pass a real referral id it just handled).
 */
export class CreateFollowUpPlanDto {
  @IsUUID()
  referralId!: string;

  @IsString()
  patientId!: string;

  @IsString()
  gpId!: string;

  @IsIn(FOLLOW_UP_REFERRAL_TYPES)
  referralType!: FollowUpReferralType;

  @IsDateString()
  nextReviewDueAt!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  requiredTests!: string[];

  @IsOptional()
  @IsBoolean()
  indefiniteReferralApplies?: boolean;
}
