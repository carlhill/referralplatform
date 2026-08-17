import { Injectable, Logger } from '@nestjs/common';
import { clinicPartsFor } from '../common/clinic-time';
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

    for (const slotStart of clinicSlotsIn(rangeStart, rangeEnd)) {
      const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
      if (slotEnd > rangeEnd) continue;
      const isBusy = busy.some((b) => overlaps(slotStart, slotEnd, b.startsAt, b.endsAt));
      const isPseudoRandomlyBusy = pseudoRandomBusy(externalCalendarId, slotStart);
      if (!isBusy && !isPseudoRandomlyBusy) {
        free.push({ startsAt: slotStart, endsAt: slotEnd });
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

/**
 * Every 30-minute slot in the range that falls on a weekday between 09:00 and 16:30
 * **in the clinic's timezone** (see common/clinic-time.ts).
 *
 * Previously this built slots with the local-time Date constructor, so "standard AU
 * clinic hours" actually meant 09:00-17:00 in whatever timezone the process ran in —
 * in a UTC container that is 19:00-03:00 Sydney time, i.e. not clinic hours at all.
 * Walking real instants and filtering by their clinic-zone parts is timezone-correct
 * by construction, including across daylight-saving transitions.
 */
function* clinicSlotsIn(rangeStart: Date, rangeEnd: Date): Generator<Date> {
  const THIRTY_MIN = 30 * 60 * 1000;
  // Align to the next 30-minute boundary so slot starts are always :00 or :30.
  let t = Math.ceil(rangeStart.getTime() / THIRTY_MIN) * THIRTY_MIN;
  for (; t < rangeEnd.getTime(); t += THIRTY_MIN) {
    const candidate = new Date(t);
    const { weekday, hour } = clinicPartsFor(candidate);
    if (weekday === 'saturday' || weekday === 'sunday') continue;
    if (hour < 9 || hour >= 17) continue;
    yield candidate;
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
