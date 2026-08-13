import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class SendSmsDto {
  @IsIn(['patient', 'carer', 'gp', 'specialist', 'internal_staff', 'system'])
  recipientType!: string;

  @IsString()
  @IsNotEmpty()
  recipientId!: string;

  @IsString()
  @IsNotEmpty()
  eventType!: string;

  @Matches(/^\+?[0-9]{6,15}$/, { message: 'phoneNumber must be a plausible E.164-style phone number' })
  phoneNumber!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsString()
  referralId?: string;
}
