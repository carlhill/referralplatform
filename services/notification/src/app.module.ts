import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuditOutboxModule } from './audit-outbox/audit-outbox.module';
import { NotificationModule } from './notifications/notification.module';
import { MessageThreadModule } from './message-threads/message-thread.module';

/**
 * Notification Service — push/SMS/email fan-out and the referral-scoped
 * secure message thread. SMS is mocked; OTP/account-activation email is
 * real for local dev via Mailhog. See BUILD_LOG/notification.md.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    AuditOutboxModule,
    NotificationModule,
    MessageThreadModule,
  ],
})
export class AppModule {}
