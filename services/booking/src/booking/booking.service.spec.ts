import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { BookingService } from './booking.service';
import { SlotsService } from './slots.service';
import { SlotClaimService } from './slot-claim.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import { CalendarClientFactory } from '../calendar/calendar-client.factory';
import { NotificationClient } from '../common/notification.client';
import { ReferralClient } from '../common/referral.client';
import { FakePrisma } from '../../test/stubs/fake-prisma';

const actor: ActorRef = { principalType: 'patient', id: 'patient-1' };

function makeService(prisma: FakePrisma) {
  const referralClient = {
    markBooked: jest.fn().mockResolvedValue(undefined),
    getReferral: jest.fn().mockResolvedValue({ gpId: 'gp-1', patientId: 'patient-1' }),
  } as unknown as ReferralClient;
  const calendarClients = new CalendarClientFactory();
  const notifications = new NotificationClient();
  const slots = new SlotsService(prisma as any);
  const slotClaim = new SlotClaimService(prisma as any, calendarClients, notifications, referralClient);
  const waitlist = new WaitlistService(prisma as any, slots, slotClaim, notifications);
  const service = new BookingService(prisma as any, slots, slotClaim, waitlist, calendarClients, notifications, referralClient);
  return { service, waitlist, referralClient };
}

async function seedSlot(prisma: FakePrisma, startsAt: string, specialistId = 'spec-1') {
  return prisma.slot.create({
    data: { specialistId, startsAt: new Date(startsAt), endsAt: new Date(new Date(startsAt).getTime() + 30 * 60 * 1000), status: 'open' },
  });
}

function baseDto(overrides: Record<string, unknown> = {}) {
  return {
    referralId: 'ref-1',
    patientId: 'patient-1',
    specialistId: 'spec-1',
    ...overrides,
  } as any;
}

describe('BookingService', () => {
  describe('create — preference matching', () => {
    it('auto-confirms the best-matching available slot', async () => {
      const prisma = new FakePrisma();
      const { service } = makeService(prisma);
      // Instants chosen for what they mean in the CLINIC timezone (Australia/Sydney,
      // AEST/UTC+10 in September), because that is the frame preferences are matched
      // in — see common/clinic-time.ts. These used to be written as if the clinic ran
      // on UTC, which is why this test only passed on a UTC machine.
      await seedSlot(prisma, '2026-09-02T04:00:00Z'); // Wed 14:00 Sydney — matches the preference
      await seedSlot(prisma, '2026-09-01T00:00:00Z'); // Tue 10:00 Sydney — soonest, but doesn't match

      const booking = await service.create(baseDto({ preferredDayOfWeek: 'wednesday', preferredTimeOfDay: 'afternoon' }), actor);

      expect(booking.status).toBe('confirmed');
      expect(booking.confirmedSlotStartsAt?.toISOString()).toBe('2026-09-02T04:00:00.000Z');
    });

    it('falls back to the waitlist when no slots exist at all', async () => {
      const prisma = new FakePrisma();
      const { service } = makeService(prisma);

      const booking = await service.create(baseDto({ preferredDayOfWeek: 'monday', preferredTimeOfDay: 'morning' }), actor);

      expect(booking.status).toBe('waitlisted');
      expect(booking.waitlistedAt).not.toBeNull();
      expect(prisma.waitlistEntries.size).toBe(1);
    });

    it('tries the next-best candidate when the top one is already booked', async () => {
      const prisma = new FakePrisma();
      const { service } = makeService(prisma);
      const best = await seedSlot(prisma, '2026-09-01T09:00:00Z');
      const second = await seedSlot(prisma, '2026-09-01T09:30:00Z');
      // Pre-book the best slot directly (simulating it having been taken already).
      await prisma.slot.update({ where: { id: best.id }, data: { status: 'booked' } });

      const booking = await service.create(baseDto(), actor);

      expect(booking.status).toBe('confirmed');
      expect(booking.slotId).toBe(second.id);
    });
  });

  describe('create — urgent fast-path', () => {
    it('bypasses preference and confirms the earliest available slot', async () => {
      const prisma = new FakePrisma();
      const { service } = makeService(prisma);
      await seedSlot(prisma, '2026-09-03T09:00:00Z');
      await seedSlot(prisma, '2026-09-01T09:00:00Z'); // earliest — should win regardless of any preference field
      await seedSlot(prisma, '2026-09-02T09:00:00Z');

      const booking = await service.create(baseDto({ urgentFastPath: true, preferredDayOfWeek: 'friday' }), actor);

      expect(booking.status).toBe('confirmed');
      expect(booking.confirmedSlotStartsAt?.toISOString()).toBe('2026-09-01T09:00:00.000Z');
      expect(booking.urgentFastPath).toBe(true);
      // Preference fields are ignored/cleared for an urgent booking — see CreateBookingDto's doc comment.
      expect(booking.preferredDayOfWeek).toBeNull();
    });
  });

  describe('confirmSlot (manual — reception/GP proposing a specific slot)', () => {
    it('confirms a specific proposed slot for a preference_captured booking', async () => {
      const prisma = new FakePrisma();
      const { service } = makeService(prisma);
      const slot = await seedSlot(prisma, '2026-09-05T09:00:00Z');
      const booking = await prisma.booking.create({ data: { referralId: 'ref-1', patientId: 'patient-1', specialistId: 'spec-1' } });

      const confirmed = await service.confirmSlot(booking.id, slot.id, actor);
      expect(confirmed.status).toBe('confirmed');
    });

    it('rejects confirming a booking that is already confirmed', async () => {
      const prisma = new FakePrisma();
      const { service } = makeService(prisma);
      const slotA = await seedSlot(prisma, '2026-09-05T09:00:00Z');
      const slotB = await seedSlot(prisma, '2026-09-05T09:30:00Z');
      const booking = await prisma.booking.create({ data: { referralId: 'ref-1', patientId: 'patient-1', specialistId: 'spec-1' } });
      await service.confirmSlot(booking.id, slotA.id, actor);

      await expect(service.confirmSlot(booking.id, slotB.id, actor)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('cancel', () => {
    it('releases the slot back to open and marks the booking cancelled', async () => {
      const prisma = new FakePrisma();
      const { service } = makeService(prisma);
      const slot = await seedSlot(prisma, '2026-09-05T09:00:00Z');
      const booking = await service.create(baseDto(), actor);
      expect(booking.status).toBe('confirmed');

      const cancelled = await service.cancel(booking.id, actor, 'Patient changed mind');

      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancellationReason).toBe('Patient changed mind');
      expect(prisma.slots.get(slot.id)!.status).toBe('open');
      expect(prisma.slots.get(slot.id)!.bookingId).toBeNull();
      expect(prisma.outbox.some((e) => e.type === 'booking.cancelled' && e.subjectId === booking.id)).toBe(true);
    });

    it('auto-fills the released slot from the waitlist (auto-notify-on-open)', async () => {
      const prisma = new FakePrisma();
      const { service } = makeService(prisma);
      const slot = await seedSlot(prisma, '2026-09-05T09:00:00Z');
      const confirmedBooking = await service.create(baseDto({ patientId: 'patient-A' }), actor);
      expect(confirmedBooking.status).toBe('confirmed');

      // A second patient wants the same specialist but nothing is open — waitlisted.
      const waitlistedBooking = await service.create(baseDto({ patientId: 'patient-B' }), actor);
      expect(waitlistedBooking.status).toBe('waitlisted');

      await service.cancel(confirmedBooking.id, actor);

      const refreshed = await service.getById(waitlistedBooking.id);
      expect(refreshed.status).toBe('confirmed');
      expect(refreshed.slotId).toBe(slot.id);
    });

    it('rejects cancelling an already-cancelled booking', async () => {
      const prisma = new FakePrisma();
      const { service } = makeService(prisma);
      await seedSlot(prisma, '2026-09-05T09:00:00Z');
      const booking = await service.create(baseDto(), actor);
      await service.cancel(booking.id, actor);

      await expect(service.cancel(booking.id, actor)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('getById / list', () => {
    it('throws NotFoundException for an unknown booking', async () => {
      const prisma = new FakePrisma();
      const { service } = makeService(prisma);
      await expect(service.getById('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('filters by patientId, specialistId, referralId, and status', async () => {
      const prisma = new FakePrisma();
      const { service } = makeService(prisma);
      await service.create(baseDto({ patientId: 'p1', specialistId: 's1' }), actor); // no slots -> waitlisted
      await seedSlot(prisma, '2026-09-05T09:00:00Z', 's2');
      await service.create(baseDto({ patientId: 'p2', specialistId: 's2' }), actor); // confirmed

      expect(await service.list({ patientId: 'p1' })).toHaveLength(1);
      expect(await service.list({ specialistId: 's2' })).toHaveLength(1);
      expect(await service.list({ status: 'waitlisted' })).toHaveLength(1);
      expect(await service.list({ status: 'confirmed' })).toHaveLength(1);
    });
  });
});
