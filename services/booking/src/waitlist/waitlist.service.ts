import { ConflictException, Injectable, Logger } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { SlotsService } from '../booking/slots.service';
import { SlotClaimService } from '../booking/slot-claim.service';
import { NotificationClient } from '../common/notification.client';
import type { BookingRecord } from '../booking/types';
import type { TimeOfDayBand } from '../booking/slot-matching';

const MAX_WAITLIST_FILL_ATTEMPTS = 20;

/**
 * Waitlist management with auto-notify-on-open —
 * specialist-directory-booking.md: "if a preferred slot opens up later ...
 * the patient gets proactively notified and can claim it in one tap ...
 * Zocdoc runs a dedicated waitlist-management feature specifically to fill
 * cancellations faster."
 *
 * Depends on `SlotClaimService` directly (not `BookingService`) so that
 * `BookingService -> WaitlistService -> SlotClaimService` stays a one-way
 * dependency chain with no circular provider reference — see
 * slot-claim.service.ts's doc comment for why the atomic claim was pulled
 * out into its own service in the first place.
 *
 * **Documented simplification** (see BUILD_LOG/booking.md): this
 * implementation auto-claims the best-matching open slot for the
 * longest-waiting entry immediately, rather than sending a notification and
 * holding a time-boxed "claim window" before moving to the next waitlisted
 * patient. A real deployment would likely want the claim-window UX (so a
 * patient who's asleep doesn't lose a 2am-released slot to someone else
 * before they can respond) — that needs a `WaitlistOffer` sub-state machine
 * with an expiry sweep, which is a reasonable v2 addition but adds a full
 * extra state machine this build's golden path doesn't need to prove the
 * core waitlist-management and auto-fill mechanics. The mock notification
 * is still sent either way, honestly reflecting "you were auto-matched",
 * not "you have N minutes to claim this".
 */
@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly slots: SlotsService,
    private readonly slotClaim: SlotClaimService,
    private readonly notifications: NotificationClient,
  ) {}

  /**
   * Adds a booking to the waitlist — business-process-flow.md's "No -> Added
   * to waitlist" branch. `_actor` is accepted (not used) to keep this
   * method's signature consistent with every other state-changing method in
   * this service — see BUILD_LOG/booking.md's judgment call on why joining
   * the waitlist itself isn't a separately-audited event (only the eventual
   * `booking.confirmed`/`booking.cancelled` transitions are, since those are
   * the only two Booking-related `AuditEventType`s shared-types defines).
   */
  async addToWaitlist(booking: BookingRecord, _actor: ActorRef): Promise<BookingRecord> {
    await this.prisma.waitlistEntry.create({
      data: {
        bookingId: booking.id,
        specialistId: booking.specialistId,
        preferredDayOfWeek: booking.preferredDayOfWeek,
        preferredTimeOfDay: booking.preferredTimeOfDay,
      },
    });
    const updated = await this.prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'waitlisted', waitlistedAt: new Date() },
    });
    await this.notifications.send({
      event: 'waitlist.slot_available', // reused: "you've been added, we'll notify you when something opens" — see notification.client.ts
      recipients: [{ principalType: 'patient', id: booking.patientId }],
      subject: { type: 'Booking', id: booking.id },
      message: 'No matching slot was available right now — added to the waitlist. We will notify you automatically the moment one opens.',
    });
    this.logger.log(`Booking ${booking.id} added to waitlist for specialist ${booking.specialistId}`);
    return updated;
  }

  /**
   * Called whenever a slot for `specialistId` becomes/became open (a
   * cancellation releasing one, or a fresh calendar sync discovering one).
   * Walks the waitlist oldest-first, and for each waiting entry, finds its
   * best-matching currently-open slot and auto-claims it via
   * `SlotClaimService.claim` — reusing the exact same concurrency-safe
   * atomic claim as every other confirmation path, so a waitlist auto-claim
   * can never double-book either.
   *
   * Bounded to `MAX_WAITLIST_FILL_ATTEMPTS` waiting entries per call so a
   * huge backlog can't turn one cancellation into an unbounded loop.
   */
  async fillFromOpenSlots(specialistId: string, actor: ActorRef): Promise<number> {
    const entries = await this.prisma.waitlistEntry.findMany({
      where: { specialistId, status: 'waiting' },
      orderBy: { createdAt: 'asc' },
      take: MAX_WAITLIST_FILL_ATTEMPTS,
    });

    let filled = 0;
    for (const entry of entries) {
      const candidates = await this.slots.rankedCandidates(
        specialistId,
        entry.preferredDayOfWeek ?? undefined,
        (entry.preferredTimeOfDay as TimeOfDayBand | null) ?? undefined,
        3,
      );
      if (candidates.length === 0) break; // nothing open at all right now — stop scanning further entries too

      let claimed = false;
      for (const candidate of candidates) {
        try {
          await this.slotClaim.claim(entry.bookingId, candidate.id, actor);
          claimed = true;
          break;
        } catch (err) {
          if (err instanceof ConflictException) continue; // someone else (another waitlist entry, or a fresh direct booking) got there first
          throw err;
        }
      }

      if (claimed) {
        filled += 1;
        await this.prisma.waitlistEntry.update({ where: { id: entry.id }, data: { notifiedAt: new Date() } });
        this.logger.log(`Waitlist entry ${entry.id} (booking ${entry.bookingId}) auto-claimed an open slot for specialist ${specialistId}`);
      }
    }
    return filled;
  }
}
