import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { EmailService } from './email.service';
import { PushProvider, MockPushProvider } from './providers/push-provider';
import { SmsProvider, MockSmsProvider } from './providers/sms-provider';

@Module({
  controllers: [NotificationController],
  providers: [
    NotificationService,
    EmailService,
    { provide: PushProvider, useClass: MockPushProvider },
    { provide: SmsProvider, useClass: MockSmsProvider },
  ],
  exports: [NotificationService, EmailService],
})
export class NotificationModule {}
