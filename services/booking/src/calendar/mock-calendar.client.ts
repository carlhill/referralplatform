import { Injectable, Logger } from '@nestjs/common';
import type {
  CalendarClient,
  CalendarEventInput,
  CalendarEventRef,
  CalendarProvider,
  FreeBusyWindow,
} from './calendar-client.interface';

/**
 * MOCK — replace with a real integration (Google Calendar API / Microsoft
 * Graph / a CalDAV client library) before any production traffic touches
 * this service. See calendar-client.interface.ts's doc comment.
 *
 * Simulates a specialist's calendar: standard AU clinic hours (weekdays,
 * 09:00–17:00, 30-minute slots), with a deterministic pseudo-random subset
 * already "busy" (existing appointments, blocked time) so free/busy sync
 * produces realistic, varied — but reproducible-in-tests — availability per
 * `externalCalendarId`. `createEvent`/`deleteEvent` maintain an in-memory
 * event store per calendar so a write-back is actually reflected in the
 * next `listFreeBusy` call, same as it would be against a real provider.
 */
@Injectable()
export class MockCalendarClient implements CalendarClient {
  readonly provider: CalendarProvider;
  private readonly logger = new Logger(MockCalendarClient.name);
  /** externalCalendarId -> Map<externalEventId, {startsAt, endsAt}> — in-memory only, per-process. */
  private readonly events = new Map<string, Map<string, { startsAt: Date; endsAt: Date }>>();
  private eventCounter = 0;

  constructor(provider: CalendarProvider = 'google') {
    this.provider = provider;
  }

  async listFreeBusy(externalCalendarId: string, rangeStart: Date, rangeEnd: Date): Promise<FreeBusyWindow[]> {
    const busy = this.busyWindowsFor(externalCalendarId, rangeStart, rangeEnd);
    const free: FreeBusyWindow[] = [];

    for (const day of eachWeekday(rangeStart, rangeEnd)) {
      for (const slotStart of clinicSlotsForDay(day)) {
        const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
        if (slotStart < rangeStart || slotEnd > rangeEnd) continue;
        const isBusy = busy.some((b) => overlaps(slotStart, slotEnd, b.startsAt, b.endsAt));
        const isPseudoRandomlyBusy = pseudoRandomBusy(externalCalendarId, slotStart);
        if (!isBusy && !isPseudoRandomlyBusy) {
          free.push({ startsAt: slotStart, endsAt: slotEnd });
        }
      }
    }
    return free;
  }

  async createEvent(externalCalendarId: string, event: CalendarEventInput): Promise<CalendarEventRef> {
    const externalEventId = `mock-${this.provider}-evt-${++this.eventCounter}`;
    const calendarEvents = this.events.get(externalCalendarId) ?? new Map();
    calendarEvents.set(externalEventId, { startsAt: event.startsAt, endsAt: event.endsAt });
    this.events.set(externalCalendarId, calendarEvents);
    this.logger.log(
      `[MOCK ${this.provider}] created event ${externalEventId} on calendar ${externalCalendarId}: "${event.title}" ${event.startsAt.toISOString()}–${event.endsAt.toISOString()}`,
    );
    return { externalEventId };
  }

  async deleteEvent(externalCalendarId: string, externalEventId: string): Promise<void> {
    this.events.get(externalCalendarId)?.delete(externalEventId);
    this.logger.log(`[MOCK ${this.provider}] deleted event ${externalEventId} on calendar ${externalCalendarId}`);
  }

  private busyWindowsFor(externalCalendarId: string, rangeStart: Date, rangeEnd: Date): FreeBusyWindow[] {
    const calendarEvents = this.events.get(externalCalendarId);
    if (!calendarEvents) return [];
    return [...calendarEvents.values()].filter((e) => overlaps(e.startsAt, e.endsAt, rangeStart, rangeEnd));
  }
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function* eachWeekday(rangeStart: Date, rangeEnd: Date): Generator<Date> {
  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);
  while (cursor < rangeEnd) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) yield new Date(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }
}

function* clinicSlotsForDay(day: Date): Generator<Date> {
  for (let hour = 9; hour < 17; hour++) {
    for (const minute of [0, 30]) {
      yield new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
    }
  }
}

/** Deterministic pseudo-random "already busy" — same (calendarId, slot) always yields the same result. */
function pseudoRandomBusy(externalCalendarId: string, slotStart: Date): boolean {
  const key = `${externalCalendarId}|${slotStart.toISOString()}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  // ~25% of slots pre-busy, so free/busy sync produces realistic partial availability.
  return hash % 4 === 0;
}
