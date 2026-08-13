import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarClientFactory } from './calendar-client.factory';
import type { CalendarProvider } from './calendar-client.interface';

const SYNC_WINDOW_DAYS = 14;

export interface CalendarConnectionRecord {
  id: string;
  specialistId: string;
  provider: string;
  externalCalendarId: string;
  connected: boolean;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Pulls free/busy from each specialist's connected calendar
 * (`CalendarClient.listFreeBusy`) and upserts `Slot` rows for windows this
 * service doesn't already know about — the read side of the two-way sync
 * described in specialist-directory-booking.md.
 *
 * **Deliberate scope limit (documented judgment call — see
 * BUILD_LOG/booking.md):** sync only ever ADDS new open slots; it never
 * deletes or force-closes a `Slot` row that already exists in this
 * service's database, even if the calendar sync no longer reports that
 * window as free (e.g. the specialist manually blocked it in their calendar
 * after this service already offered it). A real implementation would
 * reconcile removals too (with care not to yank a slot out from under a
 * patient who is actively confirming it) — out of scope for this build's
 * golden path. The concurrency-safety guarantee (BookingService.confirmSlot)
 * is unaffected either way: it only ever succeeds against a slot this
 * service's own database currently has `status = 'open'`.
 */
@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarClients: CalendarClientFactory,
  ) {}

  async connect(specialistId: string, provider: CalendarProvider, externalCalendarId: string) {
    return this.prisma.calendarConnection.upsert({
      where: { specialistId },
      create: { specialistId, provider, externalCalendarId },
      update: { provider, externalCalendarId, connected: true },
    });
  }

  async getConnection(specialistId: string): Promise<CalendarConnectionRecord> {
    const connection = await this.prisma.calendarConnection.findUnique({ where: { specialistId } });
    if (!connection) {
      throw new NotFoundException(`No calendar connection for specialist ${specialistId}`);
    }
    return connection;
  }

  /** Syncs one specialist's calendar — also directly callable from tests/ops (see CalendarConnectionsController). */
  async syncSpecialist(specialistId: string): Promise<{ createdSlots: number }> {
    const connection = await this.getConnection(specialistId);
    if (!connection.connected) {
      return { createdSlots: 0 };
    }
    const client = this.calendarClients.forProvider(connection.provider as CalendarProvider);
    const rangeStart = new Date();
    const rangeEnd = new Date(rangeStart.getTime() + SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const freeWindows = await client.listFreeBusy(connection.externalCalendarId, rangeStart, rangeEnd);

    let created = 0;
    for (const window of freeWindows) {
      // Create-if-not-exists on the (specialistId, startsAt) unique
      // constraint — a no-op if this slot is already known (whether still
      // open or already booked), never overwrites an existing row. Checked
      // with a findUnique first (rather than relying on upsert's
      // create/update branch, which doesn't cleanly report which branch
      // ran) — a benign race with a concurrent sync of the same specialist
      // just means the second `create` hits the unique constraint, which is
      // caught and treated as "already exists".
      const existing = await this.prisma.slot.findUnique({
        where: { specialistId_startsAt: { specialistId, startsAt: window.startsAt } },
      });
      if (existing) continue;
      try {
        await this.prisma.slot.create({
          data: {
            specialistId,
            startsAt: window.startsAt,
            endsAt: window.endsAt,
            status: 'open',
            source: 'calendar_sync',
            calendarConnectionId: connection.id,
          },
        });
        created += 1;
      } catch {
        // Unique constraint violation from a concurrent sync run — fine, the slot exists now either way.
        this.logger.debug(`Slot create race for specialist ${specialistId} at ${window.startsAt.toISOString()} — already created concurrently`);
      }
    }

    await this.prisma.calendarConnection.update({
      where: { specialistId },
      data: { lastSyncedAt: new Date() },
    });

    this.logger.log(`Synced calendar for specialist ${specialistId}: ${created} new slot(s) of ${freeWindows.length} free window(s)`);
    return { createdSlots: created };
  }

  async syncAllConnected(): Promise<void> {
    const connections = await this.prisma.calendarConnection.findMany({ where: { connected: true } });
    for (const connection of connections) {
      try {
        await this.syncSpecialist(connection.specialistId);
      } catch (err) {
        this.logger.error(
          `Calendar sync failed for specialist ${connection.specialistId}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }
}
