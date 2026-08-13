import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class RegisterDeviceDto {
  @IsIn(['patient', 'carer', 'gp', 'specialist', 'internal_staff', 'system'])
  recipientType!: string;

  @IsString()
  @IsNotEmpty()
  recipientId!: string;

  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsIn(['ios', 'android', 'web'])
  platform!: string;
}
