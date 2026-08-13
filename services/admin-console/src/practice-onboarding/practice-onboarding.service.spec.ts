import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { PracticeOnboardingService } from './practice-onboarding.service';
import type { PracticeOnboardingCaseRecord } from './practice-onboarding-case-types';
import { OnboardingAccountClient } from '../common/onboarding-account.client';

class FakePrisma {
  cases = new Map<string, PracticeOnboardingCaseRecord>();
  outbox: Array<{ type: string; actor: ActorRef; subjectType: string; subjectId: string; payload: Record<string, unknown> }> = [];
  private counter = 0;

  practiceOnboardingCase = {
    create: async ({ data }: { data: Partial<PracticeOnboardingCaseRecord> }) => {
      const id = `poc-${++this.counter}`;
      const now = new Date();
      const record: PracticeOnboardingCaseRecord = {
        id,
        gpPracticeId: null,
        practiceName: data.practiceName!,
        hpiO: null,
        phn: data.phn ?? null,
        state: data.state ?? null,
        contactName: data.contactName ?? null,
        contactEmail: data.contactEmail ?? null,
        contactPhone: data.contactPhone ?? null,
        stage: 'lead',
        lastKnownVerificationStatus: null,
        lastKnownComplianceAckAt: null,
        lastRefreshedAt: null,
        integrationTier: null,
        notes: data.notes ?? null,
        assignedStaffId: null,
        createdByStaffId: data.createdByStaffId!,
        createdAt: now,
        updatedAt: now,
      };
      this.cases.set(id, record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<PracticeOnboardingCaseRecord> }) => {
      const existing = this.cases.get(where.id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data, updatedAt: new Date() } as PracticeOnboardingCaseRecord;
      this.cases.set(where.id, updated);
      return updated;
    },
    findUnique: async ({ where }: { where: { id: string } }) => this.cases.get(where.id) ?? null,
    findMany: async ({ where }: { where?: { stage?: string } } = {}) => {
      let rows = [...this.cases.values()];
      if (where?.stage) rows = rows.filter((r) => r.stage === where.stage);
      return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
  };

  auditOutbox = {
    create: async ({ data }: { data: { type: string; actor: ActorRef; subjectType: string; subjectId: string; payload: Record<string, unknown> } }) => {
      this.outbox.push(data);
      return { id: `outbox-${this.outbox.length}`, ...data, publishedAt: null };
    },
  };

  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

const STAFF: ActorRef = { principalType: 'internal_staff', id: 'staff-1', displayName: 'Jo Onboarder' };

function fakeOnboardingAccountClient(overrides: Partial<OnboardingAccountClient> = {}): OnboardingAccountClient {
  return {
    getSpecialist: async () => ({ id: 'spec-1', givenName: 'A', familyName: 'B', ahpraNumber: 'MED0001', ahpraVerificationStatus: 'verified' }),
    getGpPractice: async () => ({
      id: 'gp-1',
      practiceName: 'Riverside Clinic',
      hpiO: '8003600000000000',
      state: 'NSW',
      verificationStatus: 'verified',
      integrationTier: 'full',
      complianceChecklistAcknowledgedAt: '2026-08-10T00:00:00.000Z',
    }),
    ...overrides,
  } as OnboardingAccountClient;
}

describe('PracticeOnboardingService', () => {
  it('creates a lead-stage case and audits it', async () => {
    const prisma = new FakePrisma();
    const service = new PracticeOnboardingService(prisma as any, fakeOnboardingAccountClient());

    const created = await service.create({ practiceName: 'Riverside Clinic', phn: 'PHN-01', state: 'NSW' }, STAFF);

    expect(created.stage).toBe('lead');
    expect(prisma.outbox.map((e) => e.type)).toContain('practice_onboarding_case.opened');
  });

  it('advances through the allowed happy path', async () => {
    const prisma = new FakePrisma();
    const service = new PracticeOnboardingService(prisma as any, fakeOnboardingAccountClient());
    const created = await service.create({ practiceName: 'Riverside Clinic' }, STAFF);

    let current = await service.advanceStage(created.id, { toStage: 'contacted' }, STAFF);
    expect(current.stage).toBe('contacted');

    current = await service.advanceStage(current.id, { toStage: 'registered', gpPracticeId: 'gp-1' }, STAFF);
    expect(current.stage).toBe('registered');
    expect(current.gpPracticeId).toBe('gp-1');
  });

  it('rejects a transition that skips stages', async () => {
    const prisma = new FakePrisma();
    const service = new PracticeOnboardingService(prisma as any, fakeOnboardingAccountClient());
    const created = await service.create({ practiceName: 'Riverside Clinic' }, STAFF);

    await expect(service.advanceStage(created.id, { toStage: 'live' }, STAFF)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refresh() pulls verification status once linked to a real GpPractice', async () => {
    const prisma = new FakePrisma();
    const service = new PracticeOnboardingService(prisma as any, fakeOnboardingAccountClient());
    const created = await service.create({ practiceName: 'Riverside Clinic' }, STAFF);
    await service.advanceStage(created.id, { toStage: 'contacted' }, STAFF);
    const registered = await service.advanceStage(created.id, { toStage: 'registered', gpPracticeId: 'gp-1' }, STAFF);

    const refreshed = await service.refresh(registered.id);
    expect(refreshed.lastKnownVerificationStatus).toBe('verified');
    expect(refreshed.lastKnownComplianceAckAt).not.toBeNull();
  });

  it('refresh() is a no-op for a lead not yet linked to a GpPractice', async () => {
    const prisma = new FakePrisma();
    const service = new PracticeOnboardingService(prisma as any, fakeOnboardingAccountClient());
    const created = await service.create({ practiceName: 'Riverside Clinic' }, STAFF);

    const refreshed = await service.refresh(created.id);
    expect(refreshed.lastKnownVerificationStatus).toBeNull();
  });

  it('getById() throws NotFoundException for an unknown id', async () => {
    const prisma = new FakePrisma();
    const service = new PracticeOnboardingService(prisma as any, fakeOnboardingAccountClient());
    await expect(service.getById('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
