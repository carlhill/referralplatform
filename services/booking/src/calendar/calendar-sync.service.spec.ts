import { NotFoundException } from '@nestjs/common';
import { CalendarSyncService } from './calendar-sync.service';
import { CalendarClientFactory } from './calendar-client.factory';
import { FakePrisma } from '../../test/stubs/fake-prisma';

describe('CalendarSyncService', () => {
  it('connect creates a new calendar connection', async () => {
    const prisma = new FakePrisma();
    const service = new CalendarSyncService(prisma as any, new CalendarClientFactory());

    const connection = await service.connect('spec-1', 'google', 'spec-1@group.calendar.google.com');

    expect(connection.specialistId).toBe('spec-1');
    expect(connection.provider).toBe('google');
  });

  it('getConnection throws NotFoundException when none exists', async () => {
    const prisma = new FakePrisma();
    const service = new CalendarSyncService(prisma as any, new CalendarClientFactory());
    await expect(service.getConnection('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('syncSpecialist creates Slot rows from the calendar client free/busy result and is idempotent on re-sync', async () => {
    const prisma = new FakePrisma();
    const service = new CalendarSyncService(prisma as any, new CalendarClientFactory());
    await service.connect('spec-1', 'google', 'spec-1-cal');

    const first = await service.syncSpecialist('spec-1');
    expect(first.createdSlots).toBeGreaterThan(0);

    const slotsAfterFirst = prisma.slots.size;
    const second = await service.syncSpecialist('spec-1');
    expect(second.createdSlots).toBe(0); // nothing new — same free/busy window, already synced
    expect(prisma.slots.size).toBe(slotsAfterFirst);
  });

  it('syncSpecialist never overwrites a slot that has already been booked', async () => {
    const prisma = new FakePrisma();
    const service = new CalendarSyncService(prisma as any, new CalendarClientFactory());
    await service.connect('spec-1', 'google', 'spec-1-cal');
    await service.syncSpecialist('spec-1');

    const someOpenSlot = [...prisma.slots.values()][0];
    await prisma.slot.update({ where: { id: someOpenSlot.id }, data: { status: 'booked', bookingId: 'booking-x' } });

    await service.syncSpecialist('spec-1');

    expect(prisma.slots.get(someOpenSlot.id)!.status).toBe('booked');
    expect(prisma.slots.get(someOpenSlot.id)!.bookingId).toBe('booking-x');
  });

  it('syncAllConnected syncs every connected calendar and skips disconnected ones', async () => {
    const prisma = new FakePrisma();
    const service = new CalendarSyncService(prisma as any, new CalendarClientFactory());
    await service.connect('spec-1', 'google', 'cal-1');
    await service.connect('spec-2', 'outlook', 'cal-2');
    await prisma.calendarConnection.update({ where: { specialistId: 'spec-2' }, data: { connected: false } });

    await service.syncAllConnected();

    expect([...prisma.slots.values()].some((s) => s.specialistId === 'spec-1')).toBe(true);
    expect([...prisma.slots.values()].some((s) => s.specialistId === 'spec-2')).toBe(false);
  });
});
