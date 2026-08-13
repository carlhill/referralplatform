import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ComplianceRulesModule } from './compliance-rules/compliance-rules.module';
import { ReferralModule } from './referral/referral.module';
import { AuditOutboxModule } from './audit-outbox/audit-outbox.module';

/**
 * Referral Service — referral creation, urgent fast-path, the 2-day
 * activation queue, and end-to-end referral state management, PLUS the
 * Compliance Rules Engine (module #6 of modules-and-requirements.md), built
 * as a second Nest module inside this same service — see
 * BUILD_LOG/referral.md for why the two live in one deployable rather than
 * a second services/* entry.
 *
 * `ScheduleModule.forRoot()` powers both the audit-outbox relay's poll
 * interval and ReferralModule's queue-expiry sweep.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ScheduleModule.forRoot(),
    HealthModule,
    PrismaModule,
    ComplianceRulesModule,
    ReferralModule,
    AuditOutboxModule,
  ],
})
export class AppModule {}
