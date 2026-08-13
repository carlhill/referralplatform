import type { ActorRef } from '@referralplatform/shared-types';
import { WaitlistService } from './waitlist.service';
import { SlotsService } from '../booking/slots.service';
import { SlotClaimService } from '../booking/slot-claim.service';
import { CalendarClientFactory } from '../calendar/calendar-client.factory';
import { NotificationClient } from '../common/notification.client';
import { ReferralClient } from '../common/referral.client';
import { FakePrisma } from '../../test/stubs/fake-prisma';

const actor: ActorRef = { principalType: 'system', id: 'booking-service' };

function makeService(prisma: FakePrisma) {
  const referralClient = { markBooked: jest.fn().mockResolvedValue(undefined), getReferral: jest.fn() } as unknown as ReferralClient;
  const slots = new SlotsService(prisma as any);
  const slotClaim = new SlotClaimService(prisma as any, new CalendarClientFactory(), new NotificationClient(), referralClient);
  return new WaitlistService(prisma as any, slots, slotClaim, new NotificationClient());
}

describe('WaitlistService', () => {
  it('addToWaitlist creates a WaitlistEntry and sets booking status to waitlisted', async () => {
    const prisma = new FakePrisma();
    const service = makeService(prisma);
    const booking = await prisma.booking.create({
      data: { referralId: 'ref-1', patientId: 'patient-1', specialistId: 'spec-1', preferredDayOfWeek: 'monday', preferredTimeOfDay: 'morning' },
    });

    const updated = await service.addToWaitlist(booking, actor);

    expect(updated.status).toBe('waitlisted');
    expect(updated.waitlistedAt).not.toBeNull();
    const entry = [...prisma.waitlistEntries.values()][0];
    expect(entry.bookingId).toBe(booking.id);
    expect(entry.preferredDayOfWeek).toBe('monday');
    expect(entry.status).toBe('waiting');
  });

  it('fillFromOpenSlots claims the oldest waiting entry first (FIFO) when only one slot is open', async () => {
    const prisma = new FakePrisma();
    const service = makeService(prisma);
    const bookingA = await prisma.booking.create({ data: { referralId: 'ref-A', patientId: 'pA', specialistId: 'spec-1', status: 'waitlisted' } });
    const bookingB = await prisma.booking.create({ data: { referralId: 'ref-B', patientId: 'pB', specialistId: 'spec-1', status: 'waitlisted' } });
    await service.addToWaitlist(bookingA, actor);
    await new Promise((r) => setTimeout(r, 5)); // ensure distinct createdAt ordering
    await service.addToWaitlist(bookingB, actor);

    const slot = await prisma.slot.create({
      data: { specialistId: 'spec-1', startsAt: new Date('2026-09-05T09:00:00Z'), endsAt: new Date('2026-09-05T09:30:00Z'), status: 'open' },
    });

    const filled = await service.fillFromOpenSlots('spec-1', actor);

    expect(filled).toBe(1);
    expect(prisma.bookings.get(bookingA.id)!.status).toBe('confirmed'); // A was waiting first
    expect(prisma.bookings.get(bookingA.id)!.slotId).toBe(slot.id);
    expect(prisma.bookings.get(bookingB.id)!.status).toBe('waitlisted'); // still waiting — no more slots
  });

  it('fillFromOpenSlots fills as many waiting entries as there are open slots', async () => {
    const prisma = new FakePrisma();
    const service = makeService(prisma);
    const bookingA = await prisma.booking.create({ data: { referralId: 'ref-A', patientId: 'pA', specialistId: 'spec-1', status: 'waitlisted' } });
    const bookingB = await prisma.booking.create({ data: { referralId: 'ref-B', patientId: 'pB', specialistId: 'spec-1', status: 'waitlisted' } });
    await service.addToWaitlist(bookingA, actor);
    await service.addToWaitlist(bookingB, actor);
    await prisma.slot.create({ data: { specialistId: 'spec-1', startsAt: new Date('2026-09-05T09:00:00Z'), endsAt: new Date('2026-09-05T09:30:00Z'), status: 'open' } });
    await prisma.slot.create({ data: { specialistId: 'spec-1', startsAt: new Date('2026-09-05T10:00:00Z'), endsAt: new Date('2026-09-05T10:30:00Z'), status: 'open' } });

    const filled = await service.fillFromOpenSlots('spec-1', actor);

    expect(filled).toBe(2);
    expect(prisma.bookings.get(bookingA.id)!.status).toBe('confirmed');
    expect(prisma.bookings.get(bookingB.id)!.status).toBe('confirmed');
  });

  it('fillFromOpenSlots is a no-op when there are no waiting entries', async () => {
    const prisma = new FakePrisma();
    const service = makeService(prisma);
    await prisma.slot.create({ data: { specialistId: 'spec-1', startsAt: new Date('2026-09-05T09:00:00Z'), endsAt: new Date('2026-09-05T09:30:00Z'), status: 'open' } });

    const filled = await service.fillFromOpenSlots('spec-1', actor);
    expect(filled).toBe(0);
  });

  it('fillFromOpenSlots is a no-op when there are no open slots', async () => {
    const prisma = new FakePrisma();
    const service = makeService(prisma);
    const booking = await prisma.booking.create({ data: { referralId: 'ref-1', patientId: 'p1', specialistId: 'spec-1', status: 'waitlisted' } });
    await service.addToWaitlist(booking, actor);

    const filled = await service.fillFromOpenSlots('spec-1', actor);
    expect(filled).toBe(0);
    expect(prisma.bookings.get(booking.id)!.status).toBe('waitlisted');
  });
});
