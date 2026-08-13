import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { ConsentRecordsService, type ConsentRecordEntity } from './consent-records.service';

class FakePrisma {
  records = new Map<string, ConsentRecordEntity>();
  outbox: Array<{ type: string; payload: Record<string, unknown> }> = [];
  private counter = 0;

  consentRecord = {
    create: async ({ data }: { data: Partial<ConsentRecordEntity> }) => {
      const id = `consent-${++this.counter}`;
      const now = new Date();
      const record: ConsentRecordEntity = {
        id,
        patientId: data.patientId!,
        subjectType: data.subjectType!,
        subjectId: data.subjectId!,
        sensitiveCategory: data.sensitiveCategory ?? null,
        grantedAt: now,
        grantedByPrincipalId: data.grantedByPrincipalId!,
        revokedAt: null,
        revokedByPrincipalId: null,
        reattestedAt: null,
        nextReattestationDueAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.records.set(id, record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<ConsentRecordEntity> }) => {
      const existing = this.records.get(where.id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data, updatedAt: new Date() };
      this.records.set(where.id, updated);
      return updated;
    },
    findUnique: async ({ where }: { where: { id: string } }) => this.records.get(where.id) ?? null,
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      const all = this.filter(where);
      return all[0] ?? null;
    },
    findMany: async ({ where }: { where: Record<string, unknown> }) => this.filter(where),
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

  private filter(where: Record<string, unknown>): ConsentRecordEntity[] {
    return [...this.records.values()].filter((r) => {
      if (where.patientId && r.patientId !== where.patientId) return false;
      if (where.subjectType && r.subjectType !== where.subjectType) return false;
      if (where.subjectId && r.subjectId !== where.subjectId) return false;
      if ('revokedAt' in where && where.revokedAt === null && r.revokedAt !== null) return false;
      return true;
    });
  }
}

const actor: ActorRef = { principalType: 'patient', id: 'patient-1' };

describe('ConsentRecordsService', () => {
  let prisma: FakePrisma;
  let service: ConsentRecordsService;

  beforeEach(() => {
    prisma = new FakePrisma();
    service = new ConsentRecordsService(prisma as any);
  });

  it('grants a consent record and writes an outbox row', async () => {
    const record = await service.grant({ patientId: 'p1', subjectType: 'gp_link', subjectId: 'gp-1' }, actor);
    expect(record.grantedByPrincipalId).toBe('patient-1');
    expect(prisma.outbox).toHaveLength(1);
    expect(prisma.outbox[0].type).toBe('consent.granted');
  });

  it('revokes a consent record and refuses a double-revoke', async () => {
    const record = await service.grant({ patientId: 'p1', subjectType: 'gp_link', subjectId: 'gp-1' }, actor);
    const revoked = await service.revoke(record.id, actor);
    expect(revoked.revokedAt).not.toBeNull();
    expect(prisma.outbox.some((e) => e.type === 'consent.revoked')).toBe(true);

    await expect(service.revoke(record.id, actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws NotFoundException for an unknown consent record id', async () => {
    await expect(service.getById('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists consent records for a patient, optionally filtered by subjectType', async () => {
    await service.grant({ patientId: 'p1', subjectType: 'gp_link', subjectId: 'gp-1' }, actor);
    await service.grant({ patientId: 'p1', subjectType: 'carer_delegate', subjectId: 'carer-1' }, actor);
    await service.grant({ patientId: 'p2', subjectType: 'gp_link', subjectId: 'gp-2' }, actor);

    expect(await service.listForPatient('p1')).toHaveLength(2);
    expect(await service.listForPatient('p1', 'gp_link')).toHaveLength(1);
  });

  describe('referral visibility (per-referral, not just account-wide)', () => {
    it('grants and checks visibility for a specific grantee', async () => {
      await service.grantReferralVisibility('p1', 'referral-1', 'gp-99', actor);
      expect(await service.checkReferralVisibility('p1', 'referral-1', 'gp-99')).toEqual({ visible: true });
      expect(await service.checkReferralVisibility('p1', 'referral-1', 'gp-other')).toEqual({ visible: false });
    });

    it('is idempotent when granting the same referral/grantee twice', async () => {
      const first = await service.grantReferralVisibility('p1', 'referral-1', 'gp-99', actor);
      const second = await service.grantReferralVisibility('p1', 'referral-1', 'gp-99', actor);
      expect(second.id).toBe(first.id);
    });

    it('honours an all_linked_gps grant', async () => {
      await service.grantReferralVisibility('p1', 'referral-1', 'all_linked_gps', actor);
      expect(await service.checkReferralVisibility('p1', 'referral-1', 'any-gp-at-all')).toEqual({ visible: true });
    });

    it('revokes referral visibility for one grantee without affecting others', async () => {
      await service.grantReferralVisibility('p1', 'referral-1', 'gp-99', actor);
      await service.grantReferralVisibility('p1', 'referral-1', 'gp-100', actor);
      await service.revokeReferralVisibility('p1', 'referral-1', 'gp-99', actor);

      expect(await service.checkReferralVisibility('p1', 'referral-1', 'gp-99')).toEqual({ visible: false });
      expect(await service.checkReferralVisibility('p1', 'referral-1', 'gp-100')).toEqual({ visible: true });
    });

    it('lists current grantees for a referral', async () => {
      await service.grantReferralVisibility('p1', 'referral-1', 'gp-99', actor);
      await service.grantReferralVisibility('p1', 'referral-1', 'gp-100', actor);
      const list = await service.listReferralVisibility('p1', 'referral-1');
      expect(list.map((g) => g.granteeId).sort()).toEqual(['gp-100', 'gp-99']);
    });

    it('throws NotFoundException revoking a grant that does not exist', async () => {
      await expect(service.revokeReferralVisibility('p1', 'referral-1', 'gp-99', actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
