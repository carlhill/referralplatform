import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { GpLinksModule } from './gp-links/gp-links.module';
import { AuditOutboxModule } from './audit-outbox/audit-outbox.module';

/**
 * GP Authorisation Service — the new-GP push-approval flow; links/unlinks GPs to an existing patient account.
 *
 * Owns `GpLinksModule` (the module 1B push-approval flow: request, approve,
 * decline, revoke, and the `GET /gp-links/authorisation` check other
 * services use to block referral creation for a not-yet-linked GP) and
 * `AuditOutboxModule` (the outbox-pattern relay to the Audit Log Service —
 * see root CONVENTIONS.md §7). `ScheduleModule.forRoot()` powers both the
 * outbox relay's poll interval and GpLinksModule's stale-link expiry sweep.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ScheduleModule.forRoot(),
    HealthModule,
    PrismaModule,
    GpLinksModule,
    AuditOutboxModule,
  ],
})
export class AppModule {}
