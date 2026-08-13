import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ExternalClientsModule } from './common/external-clients.module';
import { VerificationCasesModule } from './verification-cases/verification-cases.module';
import { PracticeOnboardingModule } from './practice-onboarding/practice-onboarding.module';
import { DeceasedAccessRequestsModule } from './deceased-access-requests/deceased-access-requests.module';
import { AuditLogQueryModule } from './audit-log-query/audit-log-query.module';
import { AuditOutboxModule } from './audit-outbox/audit-outbox.module';

/**
 * Admin/Ops Console (backend) — internal-staff-only tooling over four
 * bounded concerns (ui-design.md's "Admin/Ops Console" screen inventory):
 *
 *  - VerificationCasesModule — AHPRA/WWCC manual verification review queue.
 *    Owns its own data (no other service exposes a "pending manual review"
 *    queue) and snapshots live automated-verification status from
 *    onboarding-account via OnboardingAccountClient.
 *  - PracticeOnboardingModule — PHN/practice onboarding pipeline. Owns its
 *    own pipeline-stage-tracking data, linked to onboarding-account's real
 *    `GpPractice` record once one exists.
 *  - DeceasedAccessRequestsModule — a thin, real HTTP proxy over
 *    consent-security's own complete executor/family/coroner
 *    access-request review workflow (no local data of its own).
 *  - AuditLogQueryModule — a thin, real HTTP wrapper over
 *    `@referralplatform/audit-client`'s read/verify calls against the real
 *    Audit Log Service (no local data of its own).
 *
 * ExternalClientsModule provides the shared OnboardingAccountClient/
 * ConsentSecurityClient instances the first two feature modules inject.
 * ScheduleModule.forRoot() powers AuditOutboxModule's relay poll interval.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ScheduleModule.forRoot(),
    HealthModule,
    PrismaModule,
    ExternalClientsModule,
    VerificationCasesModule,
    PracticeOnboardingModule,
    DeceasedAccessRequestsModule,
    AuditLogQueryModule,
    AuditOutboxModule,
  ],
})
export class AppModule {}
