import { ConflictException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { SlotClaimService } from './slot-claim.service';
import { CalendarClientFactory } from '../calendar/calendar-client.factory';
import { NotificationClient } from '../common/notification.client';
import { ReferralClient } from '../common/referral.client';
import { FakePrisma } from '../../test/stubs/fake-prisma';

const actor: ActorRef = { principalType: 'patient', id: 'patient-1' };

function makeService(prisma: FakePrisma) {
  const referralClient = { markBooked: jest.fn().mockResolvedValue(undefined), getReferral: jest.fn() } as unknown as ReferralClient;
  const service = new SlotClaimService(prisma as any, new CalendarClientFactory(), new NotificationClient(), referralClient);
  return { service, referralClient };
}

async function seedOpenSlot(prisma: FakePrisma, overrides: Partial<{ specialistId: string; startsAt: Date }> = {}) {
  return prisma.slot.create({
    data: {
      specialistId: overrides.specialistId ?? 'spec-1',
      startsAt: overrides.startsAt ?? new Date('2026-09-01T09:00:00Z'),
      endsAt: new Date('2026-09-01T09:30:00Z'),
      status: 'open',
    },
  });
}

async function seedBooking(prisma: FakePrisma, overrides: Partial<{ specialistId: string; patientId: string }> = {}) {
  return prisma.booking.create({
    data: {
      referralId: 'ref-1',
      patientId: overrides.patientId ?? 'patient-1',
      specialistId: overrides.specialistId ?? 'spec-1',
      status: 'preference_captured',
    },
  });
}

describe('SlotClaimService', () => {
  it('claims an open slot atomically and confirms the booking', async () => {
    const prisma = new FakePrisma();
    const { service } = makeService(prisma);
    const slot = await seedOpenSlot(prisma);
    const booking = await seedBooking(prisma);

    const confirmed = await service.claim(booking.id, slot.id, actor);

    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.slotId).toBe(slot.id);
    expect(confirmed.confirmedSlotStartsAt).toEqual(slot.startsAt);
    expect(prisma.slots.get(slot.id)!.status).toBe('booked');
    expect(prisma.slots.get(slot.id)!.bookingId).toBe(booking.id);
    expect(prisma.slots.get(slot.id)!.version).toBe(1);
    expect(prisma.outbox.some((e) => e.type === 'booking.confirmed' && e.subjectId === booking.id)).toBe(true);
  });

  it('rejects claiming a slot that is not open', async () => {
    const prisma = new FakePrisma();
    const { service } = makeService(prisma);
    const slot = await seedOpenSlot(prisma);
    const bookingA = await seedBooking(prisma);
    const bookingB = await seedBooking(prisma);

    await service.claim(bookingA.id, slot.id, actor);
    await expect(service.claim(bookingB.id, slot.id, actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects claiming a slot id that does not exist at all (same as an already-taken one — 0 rows affected either way)', async () => {
    const prisma = new FakePrisma();
    const { service } = makeService(prisma);
    const booking = await seedBooking(prisma);
    await expect(service.claim(booking.id, 'nope', actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it('marks a matching waiting waitlist entry as claimed', async () => {
    const prisma = new FakePrisma();
    const { service } = makeService(prisma);
    const slot = await seedOpenSlot(prisma);
    const booking = await seedBooking(prisma);
    const entry = await prisma.waitlistEntry.create({ data: { bookingId: booking.id, specialistId: booking.specialistId } });

    await service.claim(booking.id, slot.id, actor);

    expect(prisma.waitlistEntries.get(entry.id)!.status).toBe('claimed');
    expect(prisma.waitlistEntries.get(entry.id)!.claimedAt).not.toBeNull();
  });

  it('calls the ReferralClient to mark the referral booked after confirming', async () => {
    const prisma = new FakePrisma();
    const { service, referralClient } = makeService(prisma);
    const slot = await seedOpenSlot(prisma);
    const booking = await seedBooking(prisma);

    await service.claim(booking.id, slot.id, actor);

    expect(referralClient.markBooked).toHaveBeenCalledWith('ref-1');
  });

  /**
   * **The core proof this task requires**: fire many concurrent claim
   * attempts (different bookings) at the SAME slot, via `Promise.all` — a
   * real, meaningful stress test given `FakePrisma`'s design (see that
   * file's doc comment: every simulated DB call genuinely yields to the
   * event loop via `tick()` before touching data, so these calls really do
   * interleave with each other; only `updateMany`'s own internal
   * compare-and-swap is a single non-yielding step, exactly mirroring a
   * real Postgres `UPDATE ... WHERE status = 'open'` statement's row-lock
   * atomicity). Exactly one must win; every other must lose cleanly with a
   * `ConflictException`, and the slot must end up claimed by exactly the
   * winning booking with `version` incremented exactly once.
   *
   * This proves `SlotClaimService`'s *application logic* (one guarded
   * `updateMany`, not a separate read-then-write) is race-free GIVEN a
   * database that provides atomic `UPDATE ... WHERE` semantics. The DB
   * itself actually providing that guarantee is separately proven against
   * a real local Postgres instance in
   * `test/slot-concurrency.e2e-spec.ts` — see that file and
   * BUILD_LOG/booking.md for why both layers of proof exist.
   */
  it('CONCURRENCY: only one of many concurrent claim attempts on the same slot wins', async () => {
    const prisma = new FakePrisma();
    const { service } = makeService(prisma);
    const slot = await seedOpenSlot(prisma);

    const CONCURRENT_ATTEMPTS = 25;
    const bookings = await Promise.all(
      Array.from({ length: CONCURRENT_ATTEMPTS }, (_, i) => seedBooking(prisma, { patientId: `patient-${i}` })),
    );

    const results = await Promise.allSettled(bookings.map((b) => service.claim(b.id, slot.id, actor)));

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(CONCURRENT_ATTEMPTS - 1);
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    }

    // The slot ends up booked by exactly the one winning booking, version
    // incremented exactly once (not once per attempt — proves losing
    // attempts never mutated state at all).
    const finalSlot = prisma.slots.get(slot.id)!;
    expect(finalSlot.status).toBe('booked');
    expect(finalSlot.version).toBe(1);
    const winningBookingId = (fulfilled[0] as PromiseFulfilledResult<any>).value.id;
    expect(finalSlot.bookingId).toBe(winningBookingId);

    // Exactly one booking.confirmed audit entry — not one per attempt.
    expect(prisma.outbox.filter((e) => e.type === 'booking.confirmed')).toHaveLength(1);

    // Every other booking is still sitting un-confirmed — a real caller
    // (BookingService.matchAndConfirm) is what's responsible for retrying
    // a loser against the next-best candidate slot or the waitlist; this
    // test is scoped to proving the claim primitive itself is race-free.
    const stillUnconfirmed = bookings.filter((b) => b.id !== winningBookingId);
    for (const b of stillUnconfirmed) {
      expect(prisma.bookings.get(b.id)!.status).toBe('preference_captured');
    }
  });

  it('CONCURRENCY: fires many attempts against DISTINCT slots and every one wins independently (no false contention)', async () => {
    const prisma = new FakePrisma();
    const { service } = makeService(prisma);
    const N = 15;
    const slots = await Promise.all(
      Array.from({ length: N }, (_, i) => seedOpenSlot(prisma, { startsAt: new Date(Date.UTC(2026, 8, 1, 9 + i, 0, 0)) })),
    );
    const bookings = await Promise.all(Array.from({ length: N }, (_, i) => seedBooking(prisma, { patientId: `patient-${i}` })));

    const results = await Promise.allSettled(bookings.map((b, i) => service.claim(b.id, slots[i].id, actor)));

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    for (const slot of slots) {
      expect(prisma.slots.get(slot.id)!.status).toBe('booked');
    }
  });
});
