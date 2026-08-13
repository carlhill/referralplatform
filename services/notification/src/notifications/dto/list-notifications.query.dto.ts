import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListNotificationsQueryDto {
  @IsOptional()
  @IsIn(['push', 'sms', 'email'])
  channel?: string;

  @IsOptional()
  @IsString()
  recipientType?: string;

  @IsOptional()
  @IsString()
  recipientId?: string;

  @IsOptional()
  @IsIn(['sent', 'failed', 'skipped'])
  status?: string;

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  @IsString()
  referralId?: string;

  @IsOptional()
  @IsString()
  dispatchGroupId?: string;
}
