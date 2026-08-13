import { Injectable } from '@nestjs/common';
import type { CalendarClient, CalendarProvider } from './calendar-client.interface';
import { MockCalendarClient } from './mock-calendar.client';

/**
 * Resolves a `CalendarClient` for a given provider. This is the one place
 * that decides mock-vs-real — see calendar-client.interface.ts's doc
 * comment. Caches one client instance per provider (rather than one per
 * call) so `MockCalendarClient`'s in-memory event store persists across
 * requests within this process, the same way a real client's connection
 * pool would.
 */
@Injectable()
export class CalendarClientFactory {
  private readonly clients = new Map<CalendarProvider, CalendarClient>();

  forProvider(provider: CalendarProvider): CalendarClient {
    const existing = this.clients.get(provider);
    if (existing) return existing;
    // MOCK — replace this branch with real Google Calendar API / Microsoft
    // Graph / CalDAV client construction once those integrations exist.
    // Every provider currently resolves to the same mock behaviour; the
    // `provider` field is threaded through so a real per-provider client
    // slots in here without touching any caller.
    const client = new MockCalendarClient(provider);
    this.clients.set(provider, client);
    return client;
  }
}
