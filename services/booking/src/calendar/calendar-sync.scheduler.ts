import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { CalendarSyncService } from './calendar-sync.service';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Periodic free/busy pull for every connected calendar — "kept in sync on a
 * schedule, not a live call out to someone else's site on every search"
 * (specialist-directory-booking.md, describing the analogous directory-sync
 * design principle, applied here to calendar free/busy). Five minutes is a
 * reasonable default for appointment availability (much faster-changing
 * than the daily NHSD directory sync, per that doc's explicit distinction
 * between the two) while still not hammering the calendar provider.
 */
@Injectable()
export class CalendarSyncScheduler {
  private readonly logger = new Logger(CalendarSyncScheduler.name);

  constructor(private readonly calendarSync: CalendarSyncService) {}

  @Interval(SYNC_INTERVAL_MS)
  async handleInterval(): Promise<void> {
    this.logger.debug('Running scheduled calendar sync for all connected calendars');
    await this.calendarSync.syncAllConnected();
  }
}
