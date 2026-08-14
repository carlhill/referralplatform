import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ActorRef, AuditEventType } from '@referralplatform/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarClientFactory } from '../calendar/calendar-client.factory';
import type { CalendarProvider } from '../calendar/calendar-client.interface';
import { NotificationClient } from '../common/notification.client';
import { ReferralClient } from '../common/referral.client';
import { SlotsService } from './slots.service';
import { SlotClaimService } from './slot-claim.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import type { BookingRecord } from './types';
import type { TimeOfDayBand } from './slot-matching';

/** How many ranked candidates the auto-match loop will try before falling back to the waitlist. */
export const MAX_MATCH_ATTEMPTS = 5;

interface OutboxRow {
  type: AuditEventType;
  actor: ActorRef;
  subjectType: string;
  subjectId: string;
  payload: Record<string, unknown>;
}

/** The minimal shape this service needs from a Prisma client for its own (non-claim) writes — the claim's own TxClient lives in slot-claim.service.ts. */
export interface BookingPrismaClient {
  booking: {
    create: (args: any) => Promise<BookingRecord>;
    update: (args: any) => Promise<BookingRecord>;
    findUnique: (args: any) => Promise<BookingRecord | null>;
    findMany: (args: any) => Promise<BookingRecord[]>;
  };
  slot: {
    update: (args: any) => Promise<unknown>;
  };
  waitlistEntry: {
    findUnique: (args: any) => Promise<{ id: string; status: string } | null>;
    update: (args: any) => Promise<unknown>;
  };
  calendarConnection: {
    findUnique: (args: any) => Promise<{ id: string; specialistId: string; provider: string; externalCalendarId: string } | null>;
  };
  auditOutbox: {
    create: (args: any) => Promise<unknown>;
  };
}

/**
 * Booking Service's core orchestration logic — module #9 of
 * modules-and-requirements.md / module 4 of business-process-flow.md:
 * preference capture and matching, the urgent fast-path, and the
 * waitlist/cancellation handoff. The actual concurrency-critical slot claim
 * lives in `SlotClaimService` (see that class's doc comment) — this service
 * is the orchestration around it: which candidate slots to try, in what
 * order, what to do when every candidate is already taken, and what other
 * services to notify once a booking transitions.
 */
@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly slots: SlotsService,
    private readonly slotClaim: SlotClaimService,
    private readonly waitlist: WaitlistService,
    private readonly calendarClients: CalendarClientFactory,
    private readonly notifications: NotificationClient,
    private readonly referralClient: ReferralClient,
  ) {}

  /**
   * Captures preference (or the urgent flag) and immediately attempts to
   * match — business-process-flow.md module 4: "Patient sets day/time
   * preference -> urgent fast-path flag set? -> Yes: earliest available
   * slot offered directly / No: check calendar free-busy -> matching slot
   * available? -> Yes: confirmed / No: waitlist." This method runs that
   * whole branch: create the Booking row, then try up to
   * `MAX_MATCH_ATTEMPTS` ranked candidates (soonest-first for urgent,
   * preference-ranked otherwise — see slot-matching.ts), falling back to
   * the waitlist if every candidate is taken (including lost races against
   * other concurrent bookers — see `SlotClaimService.claim`).
   */
  async create(dto: CreateBookingDto, actor: ActorRef): Promise<BookingRecord> {
    const booking = await this.prisma.booking.create({
      data: {
        referralId: dto.referralId,
        patientId: dto.patientId,
        specialistId: dto.specialistId,
        urgentFastPath: dto.urgentFastPath ?? false,
        preferredDayOfWeek: dto.urgentFastPath ? null : (dto.preferredDayOfWeek ?? null),
        preferredTimeOfDay: dto.urgentFastPath ? null : (dto.preferredTimeOfDay ?? null),
      },
    });

    return this.matchAndConfirm(booking, actor);
  }

  private async matchAndConfirm(booking: BookingRecord, actor: ActorRef): Promise<BookingRecord> {
    const candidates = booking.urgentFastPath
      ? await this.slots.rankedCandidates(booking.specialistId, undefined, undefined, MAX_MATCH_ATTEMPTS)
      : await this.slots.rankedCandidates(
          booking.specialistId,
          booking.preferredDayOfWeek ?? undefined,
          (booking.preferredTimeOfDay as TimeOfDayBand | null) ?? undefined,
          MAX_MATCH_ATTEMPTS,
        );

    for (const candidate of candidates) {
      try {
        return await this.slotClaim.claim(booking.id, candidate.id, actor);
      } catch (err) {
        if (err instanceof ConflictException) {
          // Lost the race on this candidate (someone else claimed it between
          // our read and our attempted claim) — try the next-best candidate
          // rather than failing the whole request. This is the
          // application-level half of concurrency-safety: the DB guarantees
          // at most one winner per slot; this loop is what makes losing a
          // race a transparent retry instead of a user-facing failure.
          continue;
        }
        throw err;
      }
    }

    // Every candidate was already taken (or none existed) — waitlist,
    // per business-process-flow.md's "No -> Added to waitlist".
    return this.waitlist.addToWaitlist(booking, actor);
  }

  /**
   * The general-purpose "confirm this specific slot" entry point — used by
   * reception/GP proposing a specific slot against a waitlisted or
   * preference-captured booking (specialist-directory-booking.md: "the
   * specialist or their reception staff can equally propose specific slots
   * ... a short list either side can just pick from"). Delegates the actual
   * atomic claim to `SlotClaimService` — see that class's doc comment for
   * the concurrency-safety guarantee.
   */
  async confirmSlot(bookingId: string, slotId: string, actor: ActorRef): Promise<BookingRecord> {
    const booking = await this.getById(bookingId);
    if (!['preference_captured', 'waitlisted'].includes(booking.status)) {
      throw new ConflictException(`Booking ${bookingId} cannot be confirmed from status '${booking.status}'`);
    }
    return this.slotClaim.claim(bookingId, slotId, actor);
  }

  /**
   * Patient/carer/GP-initiated cancellation — business-process-flow.md
   * module 4: "Patient cancels? -> Patient AND GP notified; slot released
   * to specialist calendar." Releases the claimed slot back to `open`
   * (making it immediately claimable again, including by the waitlist —
   * see the `fillFromOpenSlots` call below) and deletes the calendar event
   * on the specialist's real calendar (mock write-back).
   */
  async cancel(bookingId: string, actor: ActorRef, reason?: string): Promise<BookingRecord> {
    const booking = await this.getById(bookingId);
    if (!['preference_captured', 'waitlisted', 'confirmed'].includes(booking.status)) {
      throw new ConflictException(`Booking ${bookingId} cannot be cancelled from status '${booking.status}'`);
    }

    const updated = await this.prisma.$transaction(async (tx: BookingPrismaClient) => {
      if (booking.slotId) {
        await tx.slot.update({
          where: { id: booking.slotId },
          data: { status: 'open', bookingId: null, version: { increment: 1 } },
        });
      }
      if (booking.status === 'waitlisted') {
        const entry = await tx.waitlistEntry.findUnique({ where: { bookingId } });
        if (entry && entry.status === 'waiting') {
          await tx.waitlistEntry.update({ where: { id: entry.id }, data: { status: 'expired', expiredAt: new Date() } });
        }
      }
      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'cancelled', cancelledAt: new Date(), cancellationReason: reason ?? null },
      });
      await this.writeOutbox(tx, {
        type: 'booking.cancelled',
        actor,
        subjectType: 'Booking',
        subjectId: bookingId,
        payload: { fromStatus: booking.status, referralId: booking.referralId, reason: reason ?? null },
      });
      return updatedBooking;
    });

    if (booking.slotId && booking.externalCalendarEventId) {
      await this.releaseCalendarEvent(booking).catch((err) =>
        this.logger.error(
          `Calendar event release failed for booking ${bookingId} — slot is still released here; needs reconciliation`,
          err instanceof Error ? err.stack : String(err),
        ),
      );
    }

    // Dual notification — patient AND GP. GP id is looked up from the
    // Referral Service (best-effort; falls back to notifying the patient
    // only if that lookup fails — see ReferralClient.getReferral).
    const referral = await this.referralClient.getReferral(booking.referralId);
    await this.notifications.send({
      event: 'booking.cancelled',
      recipients: [
        { principalType: 'patient', id: booking.patientId },
        ...(referral?.gpId ? [{ principalType: 'gp' as const, id: referral.gpId }] : []),
      ],
      subject: { type: 'Booking', id: bookingId },
      message: `Booking cancelled${reason ? `: ${reason}` : ''}. Slot released back to the specialist's calendar.`,
    });

    // Auto-notify-on-open: immediately try to fill the just-released slot
    // (if any) from this specialist's waitlist.
    if (booking.slotId) {
      await this.waitlist.fillFromOpenSlots(booking.specialistId, actor).catch((err) =>
        this.logger.error(
          `Waitlist fill failed after cancelling booking ${bookingId}`,
          err instanceof Error ? err.stack : String(err),
        ),
      );
    }

    return updated;
  }

  async getById(id: string): Promise<BookingRecord> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) {
      throw new NotFoundException(`Booking ${id} not found`);
    }
    return booking;
  }

  async list(filter: { patientId?: string; specialistId?: string; referralId?: string; status?: string }): Promise<BookingRecord[]> {
    return this.prisma.booking.findMany({
      where: {
        ...(filter.patientId ? { patientId: filter.patientId } : {}),
        ...(filter.specialistId ? { specialistId: filter.specialistId } : {}),
        ...(filter.referralId ? { referralId: filter.referralId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async releaseCalendarEvent(booking: BookingRecord): Promise<void> {
    const connection = await this.prisma.calendarConnection.findUnique({ where: { specialistId: booking.specialistId } });
    if (!connection || !booking.externalCalendarEventId) return;
    const client = this.calendarClients.forProvider(connection.provider as CalendarProvider);
    await client.deleteEvent(connection.externalCalendarId, booking.externalCalendarEventId);
  }

  private async writeOutbox(tx: BookingPrismaClient, row: OutboxRow): Promise<void> {
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
