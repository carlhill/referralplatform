import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuditOutboxModule } from './audit-outbox/audit-outbox.module';
import { HiServiceModule } from './hi-service/hi-service.module';
import { AhpraModule } from './ahpra/ahpra.module';
import { NashModule } from './nash/nash.module';
import { DirectoryClientModule } from './directory-client/directory-client.module';
import { IdentityAccessClientModule } from './identity-access-client/identity-access-client.module';
import { NotificationModule } from './notification/notification.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { GpPracticesModule } from './gp-practices/gp-practices.module';
import { SpecialistsModule } from './specialists/specialists.module';

/**
 * Onboarding & Account Service — the SMS-link-in-production/email-link-in-
 * this-build → DOB/Medicare verification → patient-vs-carer branch → OTP
 * activation flow; owns the patient/carer/delegate account model, plus GP
 * practice and specialist onboarding. See BUILD_LOG/onboarding-account.md
 * for what's real vs. mocked, and each feature module's own doc comments.
 *
 * `ScheduleModule.forRoot()` powers `AuditOutboxModule`'s relay job (the
 * outbox-pattern half of "every clinical/consent-relevant write produces a
 * signed audit entry" — see root CONVENTIONS.md §7).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ScheduleModule.forRoot(),
    HealthModule,
    PrismaModule,
    AuditOutboxModule,
    HiServiceModule,
    AhpraModule,
    NashModule,
    DirectoryClientModule,
    IdentityAccessClientModule,
    NotificationModule,
    OnboardingModule,
    GpPracticesModule,
    SpecialistsModule,
  ],
})
export class AppModule {}
