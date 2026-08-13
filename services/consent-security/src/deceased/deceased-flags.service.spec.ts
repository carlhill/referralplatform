import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { DeceasedFlagsService, type DeceasedFlagEntity } from './deceased-flags.service';
import { EventsService } from '../events/events.service';

class FakePrisma {
  flags = new Map<string, DeceasedFlagEntity>();
  outbox: Array<{ type: string; payload: Record<string, unknown> }> = [];
  publishedEvents: Array<{ type: string; patientId: string; payload: Record<string, unknown> }> = [];
  private counter = 0;

  deceasedFlag = {
    create: async ({ data }: { data: Partial<DeceasedFlagEntity> }) => {
      const id = `flag-${++this.counter}`;
      const now = new Date();
      const record: DeceasedFlagEntity = {
        id,
        patientId: data.patientId!,
        flaggedAt: data.flaggedAt ?? now,
        flaggedByGpId: data.flaggedByGpId!,
        state: data.state!,
        reason: data.reason ?? null,
        freezeConfirmedAt: data.freezeConfirmedAt ?? now,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      this.flags.set(id, record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<DeceasedFlagEntity> }) => {
      const existing = this.flags.get(where.id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data, updatedAt: new Date() };
      this.flags.set(where.id, updated);
      return updated;
    },
    findUnique: async ({ where }: { where: { patientId: string } }) =>
      [...this.flags.values()].find((f) => f.patientId === where.patientId) ?? null,
    findMany: async ({ where }: { where: { active?: boolean } }) =>
      [...this.flags.values()].filter((f) => (where.active !== undefined ? f.active === where.active : true)),
  };

  publishedEvent = {
    create: async ({ data }: { data: { type: string; patientId: string; payload: Record<string, unknown> } }) => {
      this.publishedEvents.push(data);
      return data;
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

const actor: ActorRef = { principalType: 'gp', id: 'gp-1' };

describe('DeceasedFlagsService', () => {
  let prisma: FakePrisma;
  let service: DeceasedFlagsService;

  beforeEach(() => {
    prisma = new FakePrisma();
    service = new DeceasedFlagsService(prisma as any, new EventsService(prisma as any));
  });

  it('flags a patient deceased, audits it, and publishes the freeze event', async () => {
    const flag = await service.flag(
      { patientId: 'p1', flaggedByGpId: 'gp-1', state: 'NSW', reason: 'Deceased notification received' },
      actor,
    );
    expect(flag.active).toBe(true);
    expect(prisma.outbox.some((e) => e.type === 'patient.deceased.flagged')).toBe(true);

    expect(prisma.publishedEvents).toHaveLength(1);
    expect(prisma.publishedEvents[0]).toMatchObject({ type: 'patient.deceased.frozen', patientId: 'p1' });
    expect((prisma.publishedEvents[0].payload as any).suppress).toEqual(
      expect.arrayContaining(['followup_reminders', 'queued_referral_activation']),
    );
  });

  it('refuses to flag an already-actively-flagged patient again', async () => {
    await service.flag({ patientId: 'p1', flaggedByGpId: 'gp-1', state: 'NSW' }, actor);
    await expect(service.flag({ patientId: 'p1', flaggedByGpId: 'gp-2', state: 'NSW' }, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('getActiveFlag throws NotFoundException for a patient with no active flag', async () => {
    await expect(service.getActiveFlag('unknown')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listActive only returns active flags', async () => {
    await service.flag({ patientId: 'p1', flaggedByGpId: 'gp-1', state: 'NSW' }, actor);
    await service.flag({ patientId: 'p2', flaggedByGpId: 'gp-1', state: 'VIC' }, actor);
    expect(await service.listActive()).toHaveLength(2);
  });
});
