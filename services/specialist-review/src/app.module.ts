import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuditOutboxModule } from './audit-outbox/audit-outbox.module';
import { ExtractionModule } from './extraction/extraction.module';
import { CasesModule } from './cases/cases.module';

/**
 * Specialist Review Service — AI-assisted structured extraction for
 * specialists (pluggable ExtractionProvider), the eConsult-vs-full-
 * appointment branch, and pre-visit pathology/imaging requests. See
 * BUILD_LOG/specialist-review.md for the full design rationale.
 *
 * Kept thin: wiring only, no business logic — see CasesService for that.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditOutboxModule,
    ExtractionModule,
    CasesModule,
    HealthModule,
  ],
})
export class AppModule {}
