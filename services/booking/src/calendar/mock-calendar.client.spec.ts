import { MockCalendarClient } from './mock-calendar.client';

describe('MockCalendarClient', () => {
  it('only returns free windows within AU clinic hours on weekdays', async () => {
    const client = new MockCalendarClient('google');
    const rangeStart = new Date('2026-09-07T00:00:00Z'); // Monday
    const rangeEnd = new Date('2026-09-14T00:00:00Z'); // following Monday

    const free = await client.listFreeBusy('cal-1', rangeStart, rangeEnd);

    expect(free.length).toBeGreaterThan(0);
    for (const window of free) {
      const day = window.startsAt.getUTCDay();
      expect(day).not.toBe(0); // not Sunday
      expect(day).not.toBe(6); // not Saturday
      expect(window.startsAt.getUTCHours()).toBeGreaterThanOrEqual(9);
      expect(window.startsAt.getUTCHours()).toBeLessThan(17);
      expect(window.endsAt.getTime() - window.startsAt.getTime()).toBe(30 * 60 * 1000);
    }
  });

  it('is deterministic — the same calendar id and range produce the same free windows every call', async () => {
    const client = new MockCalendarClient('outlook');
    const rangeStart = new Date('2026-09-07T00:00:00Z');
    const rangeEnd = new Date('2026-09-08T00:00:00Z');

    const first = await client.listFreeBusy('cal-x', rangeStart, rangeEnd);
    const second = await client.listFreeBusy('cal-x', rangeStart, rangeEnd);

    expect(first.map((w) => w.startsAt.toISOString())).toEqual(second.map((w) => w.startsAt.toISOString()));
  });

  it('different calendar ids produce different availability (not identical pseudo-random busy patterns)', async () => {
    const client = new MockCalendarClient('caldav');
    const rangeStart = new Date('2026-09-07T00:00:00Z');
    const rangeEnd = new Date('2026-09-08T00:00:00Z');

    const a = await client.listFreeBusy('cal-a', rangeStart, rangeEnd);
    const b = await client.listFreeBusy('cal-b', rangeStart, rangeEnd);

    expect(a.map((w) => w.startsAt.toISOString())).not.toEqual(b.map((w) => w.startsAt.toISOString()));
  });

  it('createEvent makes that window busy, so a subsequent listFreeBusy excludes it', async () => {
    const client = new MockCalendarClient('google');
    const rangeStart = new Date('2026-09-07T00:00:00Z');
    const rangeEnd = new Date('2026-09-08T00:00:00Z');
    const before = await client.listFreeBusy('cal-y', rangeStart, rangeEnd);
    const target = before[0];

    const ref = await client.createEvent('cal-y', { startsAt: target.startsAt, endsAt: target.endsAt, title: 'Test appt' });
    expect(ref.externalEventId).toBeTruthy();

    const after = await client.listFreeBusy('cal-y', rangeStart, rangeEnd);
    expect(after.some((w) => w.startsAt.getTime() === target.startsAt.getTime())).toBe(false);
  });

  it('deleteEvent frees the window up again', async () => {
    const client = new MockCalendarClient('google');
    const rangeStart = new Date('2026-09-07T00:00:00Z');
    const rangeEnd = new Date('2026-09-08T00:00:00Z');
    const before = await client.listFreeBusy('cal-z', rangeStart, rangeEnd);
    const target = before[0];
    const ref = await client.createEvent('cal-z', { startsAt: target.startsAt, endsAt: target.endsAt, title: 'Test appt' });

    await client.deleteEvent('cal-z', ref.externalEventId);

    const after = await client.listFreeBusy('cal-z', rangeStart, rangeEnd);
    expect(after.some((w) => w.startsAt.getTime() === target.startsAt.getTime())).toBe(true);
  });
});
