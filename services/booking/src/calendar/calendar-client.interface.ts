/**
 * The clean interface every calendar provider integration implements — see
 * specialist-directory-booking.md: "ask the specialist to connect whatever
 * calendar they already use day-to-day — Google Calendar, Outlook/Microsoft
 * 365, or any standard CalDAV/ICS feed — for free/busy visibility ... design
 * this as two-way, not read-only, from the start."
 *
 * Only `MockCalendarClient` (calendar/mock-calendar.client.ts) is
 * implemented in this build — MOCK, replace with a real integration
 * (Google Calendar API / Microsoft Graph / a CalDAV client library) before
 * any production traffic touches this service. Nothing else in this
 * service, and no caller of CalendarSyncService or BookingService, should
 * ever import a concrete client directly — always go through
 * `CalendarClientFactory` (calendar/calendar-client.factory.ts) so swapping
 * the mock for a real implementation later is a one-file change.
 */
export type CalendarProvider = 'google' | 'outlook' | 'caldav';

export interface FreeBusyWindow {
  startsAt: Date;
  endsAt: Date;
}

export interface CalendarEventInput {
  startsAt: Date;
  endsAt: Date;
  title: string;
  description?: string;
}

export interface CalendarEventRef {
  externalEventId: string;
}

export interface CalendarClient {
  readonly provider: CalendarProvider;

  /**
   * Returns the free (bookable) windows on this calendar within
   * [rangeStart, rangeEnd) — read side of the two-way sync. A real
   * implementation would call the provider's free/busy API and invert busy
   * blocks against the specialist's configured working hours; this
   * interface deliberately returns FREE windows directly (not busy blocks)
   * so CalendarSyncService doesn't need provider-specific working-hours
   * logic.
   */
  listFreeBusy(externalCalendarId: string, rangeStart: Date, rangeEnd: Date): Promise<FreeBusyWindow[]>;

  /**
   * Write side of the two-way sync — called once a booking is confirmed
   * (BookingService.confirmSlot()), per specialist-directory-booking.md:
   * "the moment a patient books, that booking has to land back in the
   * specialist's real system of record too."
   */
  createEvent(externalCalendarId: string, event: CalendarEventInput): Promise<CalendarEventRef>;

  /** Called on cancellation, to release the slot on the specialist's real calendar too. */
  deleteEvent(externalCalendarId: string, externalEventId: string): Promise<void>;
}
