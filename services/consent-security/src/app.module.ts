import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConsentRecordsModule } from './consent-records/consent-records.module';
import { LinkedGpsModule } from './linked-gps/linked-gps.module';
import { ReattestationsModule } from './reattestations/reattestations.module';
import { ConcernsModule } from './concerns/concerns.module';
import { DeceasedModule } from './deceased/deceased.module';
import { EventsModule } from './events/events.module';
import { AuditOutboxModule } from './audit-outbox/audit-outbox.module';

/**
 * Consent & Security Service — the consent page, linked-GP management, carer re-attestation, raise-a-concern triage, deceased-patient flag/freeze workflow.
 *
 * Owns five bounded concerns (each its own module, per root CONVENTIONS.md's
 * module-per-domain-concept pattern):
 *  - ConsentRecordsModule: the consent page's write/read API, including
 *    per-referral (not just account-wide) visibility grants.
 *  - LinkedGpsModule: a thin, real HTTP proxy over the GP Authorisation
 *    Service's REST API for the "linked GPs and practices — revoke" list.
 *  - ReattestationsModule: periodic carer/delegate re-attestation
 *    scheduling.
 *  - ConcernsModule: the "raise a concern" plain-language triage engine.
 *  - DeceasedModule: the GP-triggered deceased-patient flag/freeze workflow
 *    and the human-reviewed executor/family/coroner access-request queue.
 * EventsModule is the interim polling-based cross-service publish mechanism
 * DeceasedModule uses (see events/events.service.ts); AuditOutboxModule is
 * the relay half of the outbox pattern every other module writes through.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ScheduleModule.forRoot(),
    HealthModule,
    PrismaModule,
    ConsentRecordsModule,
    LinkedGpsModule,
    ReattestationsModule,
    ConcernsModule,
    EventsModule,
    DeceasedModule,
    AuditOutboxModule,
  ],
})
export class AppModule {}
