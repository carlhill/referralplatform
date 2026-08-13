import { SlotsService } from './slots.service';
import { FakePrisma } from '../../test/stubs/fake-prisma';

describe('SlotsService', () => {
  it('lists only open slots for the given specialist, soonest first', async () => {
    const prisma = new FakePrisma();
    const service = new SlotsService(prisma as any);
    await prisma.slot.create({ data: { specialistId: 'spec-1', startsAt: new Date('2026-09-02T09:00:00Z'), endsAt: new Date('2026-09-02T09:30:00Z'), status: 'open' } });
    await prisma.slot.create({ data: { specialistId: 'spec-1', startsAt: new Date('2026-09-01T09:00:00Z'), endsAt: new Date('2026-09-01T09:30:00Z'), status: 'open' } });
    await prisma.slot.create({ data: { specialistId: 'spec-1', startsAt: new Date('2026-09-01T10:00:00Z'), endsAt: new Date('2026-09-01T10:30:00Z'), status: 'booked' } });
    await prisma.slot.create({ data: { specialistId: 'spec-2', startsAt: new Date('2026-09-01T09:00:00Z'), endsAt: new Date('2026-09-01T09:30:00Z'), status: 'open' } });

    const open = await service.listOpen('spec-1');
    expect(open).toHaveLength(2);
    expect(open[0].startsAt.toISOString()).toBe('2026-09-01T09:00:00.000Z');
    expect(open.every((s) => s.status === 'open')).toBe(true);
  });

  it('ranks candidates by preference and limits the result', async () => {
    const prisma = new FakePrisma();
    const service = new SlotsService(prisma as any);
    await prisma.slot.create({ data: { specialistId: 'spec-1', startsAt: new Date('2026-09-01T09:00:00Z'), endsAt: new Date('2026-09-01T09:30:00Z'), status: 'open' } }); // tuesday morning
    await prisma.slot.create({ data: { specialistId: 'spec-1', startsAt: new Date('2026-09-02T14:00:00Z'), endsAt: new Date('2026-09-02T14:30:00Z'), status: 'open' } }); // wednesday afternoon

    const ranked = await service.rankedCandidates('spec-1', 'tuesday', 'morning', 5);
    expect(ranked[0].startsAt.toISOString()).toBe('2026-09-01T09:00:00.000Z');

    const limited = await service.rankedCandidates('spec-1', undefined, undefined, 1);
    expect(limited).toHaveLength(1);
  });
});
