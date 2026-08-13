import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Body of `POST /cases` — ingests a referral packet for specialist review.
 * Pushed by whichever upstream service hands a referral off for review
 * (intended real caller: the Referral/Booking Service once a referral
 * reaches `booked`), never read directly out of the Referral Service's own
 * schema — see root CONVENTIONS.md §6 and prisma/schema.prisma's
 * `ReferralCase` doc comment.
 */
export class CreateCaseDto {
  @IsString()
  @MinLength(1)
  referralId!: string;

  @IsString()
  @MinLength(1)
  patientId!: string;

  @IsString()
  @MinLength(1)
  gpId!: string;

  @IsOptional()
  @IsString()
  specialistId?: string;

  @IsOptional()
  @IsBoolean()
  urgent?: boolean;

  @IsString()
  @MinLength(1)
  referralText!: string;

  @IsOptional()
  @IsString()
  reasonForReferralHint?: string;
}
