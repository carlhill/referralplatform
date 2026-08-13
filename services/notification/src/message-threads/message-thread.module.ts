import { Module } from '@nestjs/common';
import { ReferralMessageThreadController, MessageThreadByIdController } from './message-thread.controller';
import { MessageThreadService } from './message-thread.service';
import { AuditOutboxModule } from '../audit-outbox/audit-outbox.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [AuditOutboxModule, NotificationModule],
  controllers: [ReferralMessageThreadController, MessageThreadByIdController],
  providers: [MessageThreadService],
  exports: [MessageThreadService],
})
export class MessageThreadModule {}
