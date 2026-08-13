import { Module } from '@nestjs/common';
import { CalendarConnectionsController } from './calendar-connections.controller';
import { CalendarSyncService } from './calendar-sync.service';
import { CalendarSyncScheduler } from './calendar-sync.scheduler';
import { CalendarClientFactory } from './calendar-client.factory';

@Module({
  controllers: [CalendarConnectionsController],
  providers: [CalendarSyncService, CalendarSyncScheduler, CalendarClientFactory],
  exports: [CalendarSyncService, CalendarClientFactory],
})
export class CalendarModule {}
