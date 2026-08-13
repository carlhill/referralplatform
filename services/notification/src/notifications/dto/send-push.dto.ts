import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class SendPushDto {
  @IsIn(['patient', 'carer', 'gp', 'specialist', 'internal_staff', 'system'])
  recipientType!: string;

  @IsString()
  @IsNotEmpty()
  recipientId!: string;

  /** Free-text classification of what triggered this notification, e.g. "referral.declined". */
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
}
