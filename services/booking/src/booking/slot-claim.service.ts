import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ActorRef, AuditEventType } from '@referralplatform/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarClientFactory } from '../calendar/calendar-client.factory';
import type { CalendarProvider } from '../calendar/calendar-client.interface';
import { NotificationClient } from '../common/notification.client';
import { ReferralClient } from '../common/referral.client';
import type { BookingRecord, SlotRecord, WaitlistEntryRecord } from './types';

interface OutboxRow {
  type: AuditEventType;
  actor: ActorRef;
  subjectType: string;
  subjectId: string;
  payload: Record<string, unknown>;
}

/** The minimal shape this service needs from a Prisma transaction client — kept narrow so unit tests can fake it easily (mirrors services/referral/src/referral/referral.service.ts's TxClient pattern). */
export interface TxClient {
  slot: {
    updateMany: (args: any) => Promise<{ count: number }>;
    findUnique: (args: any) => Promise<SlotRecord | null>;
    update: (args: any) => Promise<SlotRecord>;
  };
  booking: {
    update: (args: any) => Promise<BookingRecord>;
  };
  waitlistEntry: {
    update: (args: any) => Promise<WaitlistEntryRecord>;
    findUnique: (args: any) => Promise<WaitlistEntryRecord | null>;
  };
  auditOutbox: {
    create: (args: any) => Promise<unknown>;
  };
}

/**
 * The single, shared, concurrency-safe "claim this specific open slot for
 * this specific booking" operation — deliberately its own service (rather
 * than a private method on `BookingService`) so both `BookingService`
 * (auto-match loop, manual reception confirm) and `WaitlistService`
 * (auto-claim-on-open) depend on it one-directionally instead of on each
 * other, avoiding a circular provider dependency while guaranteeing every
 * code path that can confirm a booking goes through exactly one
 * implementation of the atomic claim.
 *
 * **This is the concurrency-critical class.** See `claim()`'s doc comment
 * for the actual guarantee and BUILD_LOG/booking.md ("Concurrency-safe slot
 * booking") for the real-Postgres proof.
 */
@Injectable()
export class SlotClaimService {
  private readonly logger = new Logger(SlotClaimService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarClients: CalendarClientFactory,
    private readonly notifications: NotificationClient,
    private readonly referralClient: ReferralClient,
  ) {}

  /**
   * Atomically claims `slotId` for `bookingId`, or throws
   * `ConflictException` if it's no longer open (already booked by a
   * concurrent request, or never existed as open). The DB-level guarantee:
   * a single `UPDATE slot SET status = 'booked', ... WHERE id = ? AND
   * status = 'open'` (Prisma's `updateMany`, compiled to exactly that SQL)
   * inside a transaction. Postgres takes a row lock for the UPDATE's
   * duration; a second, truly concurrent transaction attempting the same
   * UPDATE against the same slot blocks on that lock until the first
   * commits, then re-evaluates its own `WHERE status = 'open'` against the
   * now-committed row — which no longer matches — and affects zero rows.
   * That's what makes two concurrent booking attempts on the same slot
   * unable to both succeed; proven against a real local Postgres instance
   * in `test/slot-concurrency.e2e-spec.ts`.
   */
  async claim(bookingId: string, slotId: string, actor: ActorRef): Promise<BookingRecord> {
    const { slot, booking } = await this.prisma.$transaction(async (tx: TxClient) => {
      const result = await tx.slot.updateMany({
        where: { id: slotId, status: 'open' },
        data: { status: 'booked', bookingId, version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new ConflictException(`Slot ${slotId} is no longer available — it was booked (or is not open)`);
      }

      const slot = await tx.slot.findUnique({ where: { id: slotId } });
      if (!slot) {
        throw new NotFoundException(`Slot ${slotId} not found immediately after claiming it — data corruption`);
      }

      const booking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'confirmed',
          slotId,
          confirmedSlotStartsAt: slot.startsAt,
          confirmedSlotEndsAt: slot.endsAt,
          slotVersion: slot.version,
        },
      });

      const waitlistEntry = await tx.waitlistEntry.findUnique({ where: { bookingId } });
      if (waitlistEntry && waitlistEntry.status === 'waiting') {
        await tx.waitlistEntry.update({ where: { id: waitlistEntry.id }, data: { status: 'claimed', claimedAt: new Date() } });
      }

      await this.writeOutbox(tx, {
        type: 'booking.confirmed',
        actor,
        subjectType: 'Booking',
        subjectId: bookingId,
        payload: {
          referralId: booking.referralId,
          specialistId: booking.specialistId,
          slotId,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          urgentFastPath: booking.urgentFastPath,
        },
      });

      return { slot, booking };
    });

    // Everything below is best-effort, deliberately OUTSIDE the DB
    // transaction — the booking is already durably confirmed at this point
    // (slot claimed, Booking row updated, audit outbox row written, all
    // atomically). A calendar-provider or Referral/Notification Service
    // hiccup here must not roll back a real, already-true booking; it's
    // logged loudly and left for ops/reconciliation instead. See
    // BUILD_LOG/booking.md for why this is the right tradeoff for a
    // two-way-sync write-back rather than holding the DB transaction open
    // across external I/O.
    await this.writeBackToCalendar(slot, booking).catch((err) =>
      this.logger.error(
        `Calendar write-back failed for booking ${bookingId} (slot ${slotId}) — booking is still confirmed; needs reconciliation`,
        err instanceof Error ? err.stack : String(err),
      ),
    );
    await this.referralClient.markBooked(booking.referralId);
    await this.notifications.send({
      event: 'booking.confirmed',
      recipients: [
        { principalType: 'patient', id: booking.patientId },
        { principalType: 'specialist', id: booking.specialistId },
      ],
      subject: { type: 'Booking', id: bookingId },
      message: `Booking confirmed for ${slot.startsAt.toISOString()} — written back to calendar + secure message to reception.`,
    });

    return booking;
  }

  private async writeBackToCalendar(slot: SlotRecord, booking: BookingRecord): Promise<void> {
    if (!slot.calendarConnectionId) return; // manually-created slot (e.g. tests/ops) with no connected calendar to write back to
    const connection = await this.prisma.calendarConnection.findUnique({ where: { id: slot.calendarConnectionId } });
    if (!connection) return;

    const client = this.calendarClients.forProvider(connection.provider as CalendarProvider);
    const ref = await client.createEvent(connection.externalCalendarId, {
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      title: `ReferralPlatform appointment — referral ${booking.referralId}`,
      description: `Booked via ReferralPlatform. Booking id: ${booking.id}.`,
    });
    // Two independent, non-transactional updates — this is a secondary
    // cache of the external event id (used only to delete the event later
    // on cancellation), not part of the atomic booking-confirmation
    // guarantee above.
    await this.prisma.slot.update({ where: { id: slot.id }, data: { externalEventId: ref.externalEventId } });
    await this.prisma.booking.update({ where: { id: booking.id }, data: { externalCalendarEventId: ref.externalEventId } });
  }

  private async writeOutbox(tx: TxClient, row: OutboxRow): Promise<void> {
    await tx.auditOutbox.create({
      data: {
        type: row.type,
        actor: row.actor as unknown as object,
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        payload: row.payload as unknown as object,
      },
    });
  }
}
