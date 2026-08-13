import type { ActorRef } from '@referralplatform/shared-types';
import { NotFoundException } from '@nestjs/common';
import { ReattestationsService, type ReattestationScheduleEntity } from './reattestations.service';

class FakePrisma {
  schedules = new Map<string, ReattestationScheduleEntity>();
  outbox: Array<{ type: string; payload: Record<string, unknown> }> = [];
  private counter = 0;

  reattestationSchedule = {
    upsert: async ({ where, update, create }: any) => {
      const key = `${where.carerId_patientId.carerId}:${where.carerId_patientId.patientId}`;
      const existing = [...this.schedules.values()].find((s) => `${s.carerId}:${s.patientId}` === key);
      if (existing) {
        const updated = { ...existing, ...update, updatedAt: new Date() };
        this.schedules.set(existing.id, updated);
        return updated;
      }
      const id = `sched-${++this.counter}`;
      const now = new Date();
      const record: ReattestationScheduleEntity = {
        id,
        carerId: create.carerId,
        patientId: create.patientId,
        relationship: create.relationship,
        cadenceDays: create.cadenceDays,
        lastReattestedAt: null,
        nextDueAt: create.nextDueAt,
        createdAt: now,
        updatedAt: now,
      };
      this.schedules.set(id, record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<ReattestationScheduleEntity> }) => {
      const existing = this.schedules.get(where.id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data, updatedAt: new Date() };
      this.schedules.set(where.id, updated);
      return updated;
    },
    findUnique: async ({ where }: { where: { id: string } }) => this.schedules.get(where.id) ?? null,
    findMany: async ({ where }: { where: { patientId?: string; nextDueAt?: { lte: Date } } }) => {
      return [...this.schedules.values()]
        .filter((s) => (where.patientId ? s.patientId === where.patientId : true))
        .filter((s) => (where.nextDueAt ? s.nextDueAt.getTime() <= where.nextDueAt.lte.getTime() : true));
    },
  };

  auditOutbox = {
    create: async ({ data }: { data: { type: string; payload: Record<string, unknown> } }) => {
      this.outbox.push(data);
      return data;
    },
  };

  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

const actor: ActorRef = { principalType: 'patient', id: 'patient-1' };

describe('ReattestationsService', () => {
  let prisma: FakePrisma;
  let service: ReattestationsService;

  beforeEach(() => {
    prisma = new FakePrisma();
    service = new ReattestationsService(prisma as any);
  });

  it('creates a schedule with the default annual cadence', async () => {
    const sched = await service.schedule({ carerId: 'c1', patientId: 'p1', relationship: 'adult_child' });
    expect(sched.cadenceDays).toBe(365);
    expect(sched.nextDueAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('upserts (re-scheduling does not duplicate) for the same carer/patient pair', async () => {
    const first = await service.schedule({ carerId: 'c1', patientId: 'p1', relationship: 'adult_child' });
    const second = await service.schedule({
      carerId: 'c1',
      patientId: 'p1',
      relationship: 'adult_child',
      cadenceDays: 30,
    });
    expect(second.id).toBe(first.id);
    expect(second.cadenceDays).toBe(30);
  });

  it('attest resets lastReattestedAt/nextDueAt and writes an outbox row', async () => {
    const sched = await service.schedule({
      carerId: 'c1',
      patientId: 'p1',
      relationship: 'adult_child',
      cadenceDays: 30,
    });
    const attested = await service.attest(sched.id, actor);
    expect(attested.lastReattestedAt).not.toBeNull();
    expect(prisma.outbox.some((e) => e.type === 'carer.reattested')).toBe(true);
  });

  it('throws NotFoundException attesting an unknown schedule', async () => {
    await expect(service.attest('missing', actor)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listDue returns only schedules at or before the given time', async () => {
    const a = await service.schedule({ carerId: 'c1', patientId: 'p1', relationship: 'adult_child', cadenceDays: 30 });
    const b = await service.schedule({
      carerId: 'c2',
      patientId: 'p1',
      relationship: 'spouse_partner',
      cadenceDays: 365,
    });
    // Force `a` overdue.
    prisma.schedules.get(a.id)!.nextDueAt = new Date(Date.now() - 1000);

    const due = await service.listDue();
    expect(due.map((d) => d.id)).toEqual([a.id]);
    expect(due.map((d) => d.id)).not.toContain(b.id);
  });
});
