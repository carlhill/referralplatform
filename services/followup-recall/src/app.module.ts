import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { FollowUpPlansModule } from './follow-up-plans/follow-up-plans.module';
import { RemindersModule } from './reminders/reminders.module';
import { TestCompletionModule } from './test-completion/test-completion.module';
import { DeceasedSuppressionModule } from './deceased-suppression/deceased-suppression.module';
import { AuditOutboxModule } from './audit-outbox/audit-outbox.module';

/**
 * Follow-up & Recall Service — Follow-up Plan management, multi-channel
 * reminder scheduling with escalation, automatic test-completion detection
 * (mock pathology e-result / My Health Record) with self-report fallback,
 * and IMMEDIATE reminder suppression on a "patient deceased" event from the
 * Consent & Security Service. See BUILD_LOG/followup-recall.md.
 *
 * `ScheduleModule.forRoot()` powers every cron/interval job in this
 * service: the audit-outbox relay, the deceased-event poller, the reminder
 * dispatch loop, the escalation sweep, and the test-completion detection
 * sweep.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ScheduleModule.forRoot(),
    HealthModule,
    PrismaModule,
    DeceasedSuppressionModule,
    FollowUpPlansModule,
    RemindersModule,
    TestCompletionModule,
    AuditOutboxModule,
  ],
})
export class AppModule {}
