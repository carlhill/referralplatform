import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

class EmailFallbackDto {
  @IsEmail()
  to!: string;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsOptional()
  @IsString()
  html?: string;
}

class SmsFallbackDto {
  @Matches(/^\+?[0-9]{6,15}$/, { message: 'phoneNumber must be a plausible E.164-style phone number' })
  phoneNumber!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;
}

/**
 * The primary fan-out entry point: push is attempted first (the primary
 * channel for time-sensitive events per minors-multigp-exception-paths.md's
 * exception-path design); if the recipient has no active registered device
 * (or the mock provider fails), each channel in `fallbackChannels` is tried
 * in order until one succeeds. Every attempt across every channel is
 * logged with a shared `dispatchGroupId` so the whole fallback story is
 * queryable as one unit via `GET /notifications?dispatchGroupId=...`.
 */
export class DispatchNotificationDto {
  @IsIn(['patient', 'carer', 'gp', 'specialist', 'internal_staff', 'system'])
  recipientType!: string;

  @IsString()
  @IsNotEmpty()
  recipientId!: string;

  @IsString()
  @IsNotEmpty()
  eventType!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  referralId?: string;

  /** Ordered list of channels to try if push has no successful delivery — e.g. ['email', 'sms']. */
  @IsOptional()
  @IsArray()
  @IsIn(['email', 'sms'], { each: true })
  fallbackChannels?: ('email' | 'sms')[];

  @IsOptional()
  @ValidateNested()
  @Type(() => EmailFallbackDto)
  email?: EmailFallbackDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SmsFallbackDto)
  sms?: SmsFallbackDto;
}
