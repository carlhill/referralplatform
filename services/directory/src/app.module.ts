import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { DirectoryModule } from './directory/directory.module';
import { SecureMessagingModule } from './secure-messaging/secure-messaging.module';
import { AuditOutboxModule } from './audit-outbox/audit-outbox.module';

/**
 * Directory Service AND Secure Messaging Gateway — both stamped into this
 * one service workspace rather than split into two, per BUILD_LOG/directory.md's
 * documented judgment call: the two modules (`DirectoryModule`,
 * `SecureMessagingModule`) are logically separate but share one Postgres
 * schema/deployable, since Secure Messaging routing decisions read directly
 * from Directory Service's `DirectoryEntry` table (which specialist,
 * onboarded or not, vendor endpoint) and splitting them into two services
 * on day one would mean an extra network hop for every referral routed,
 * for no isolation benefit at this build's scale — see
 * `claude/modules-and-requirements.md`'s module 7/8 split for why they're
 * conceptually distinct even though co-located here.
 *
 * `ScheduleModule.forRoot()` powers both `NhsdSyncService`'s daily cron and
 * `AuditOutboxModule`'s relay poll interval.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ScheduleModule.forRoot(),
    HealthModule,
    PrismaModule,
    DirectoryModule,
    SecureMessagingModule,
    AuditOutboxModule,
  ],
})
export class AppModule {}
