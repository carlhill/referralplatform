import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { CalendarModule } from './calendar/calendar.module';
import { BookingModule } from './booking/booking.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { AuditOutboxModule } from './audit-outbox/audit-outbox.module';

/**
 * Booking Service — calendar free/busy sync, preference capture and
 * matching, waitlist management, urgent fast-path, and
 * cancellation/dual-notification. Module #9 of modules-and-requirements.md
 * / module 4 of business-process-flow.md — see BUILD_LOG/booking.md for
 * the full design rationale.
 *
 * `ScheduleModule.forRoot()` powers the audit-outbox relay's poll interval
 * and CalendarSyncScheduler's periodic free/busy pull.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ScheduleModule.forRoot(),
    HealthModule,
    PrismaModule,
    CalendarModule,
    WaitlistModule,
    BookingModule,
    AuditOutboxModule,
  ],
})
export class AppModule {}
