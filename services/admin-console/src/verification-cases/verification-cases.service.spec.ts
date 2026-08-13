import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { VerificationCasesService } from './verification-cases.service';
import type { VerificationCaseRecord } from './verification-case-types';
import { OnboardingAccountClient } from '../common/onboarding-account.client';

/**
 * A small hand-rolled fake standing in for PrismaService, shaped exactly
 * like the calls VerificationCasesService actually makes
 * (`verificationCase.*`, `auditOutbox.*`, `$transaction`) — the same
 * pattern services/gp-authorisation/src/gp-links/gp-links.service.spec.ts
 * and services/consent-security's *.service.spec.ts files use.
 */
class FakePrisma {
  cases = new Map<string, VerificationCaseRecord>();
  outbox: Array<{ type: string; actor: ActorRef; subjectType: string; subjectId: string; payload: Record<string, unknown> }> = [];
  private counter = 0;

  verificationCase = {
    create: async ({ data }: { data: Partial<VerificationCaseRecord> }) => {
      const id = `case-${++this.counter}`;
      const now = new Date();
      const record: VerificationCaseRecord = {
        id,
        caseType: data.caseType!,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
        subjectName: data.subjectName!,
        subjectIdentifier: data.subjectIdentifier ?? null,
        issuingState: data.issuingState ?? null,
        lastKnownAutomatedStatus: null,
        lastKnownAutomatedDetail: null,
        lastRefreshedAt: null,
        status: 'open',
        assignedStaffId: null,
        notes: data.notes ?? null,
        decisionNote: null,
        decidedByStaffId: null,
        decidedAt: null,
        createdByStaffId: data.createdByStaffId!,
        createdAt: now,
        updatedAt: now,
      };
      this.cases.set(id, record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<VerificationCaseRecord> }) => {
      const existing = this.cases.get(where.id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data, updatedAt: new Date() } as VerificationCaseRecord;
      this.cases.set(where.id, updated);
      return updated;
    },
    findUnique: async ({ where }: { where: { id: string } }) => this.cases.get(where.id) ?? null,
    findMany: async ({ where }: { where?: { status?: string; caseType?: string } } = {}) => {
      let rows = [...this.cases.values()];
      if (where?.status) rows = rows.filter((r) => r.status === where.status);
      if (where?.caseType) rows = rows.filter((r) => r.caseType === where.caseType);
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

const STAFF: ActorRef = { principalType: 'internal_staff', id: 'staff-1', displayName: 'Jo Reviewer' };

function fakeOnboardingAccountClient(overrides: Partial<OnboardingAccountClient> = {}): OnboardingAccountClient {
  return {
    getSpecialist: async () => ({ id: 'spec-1', givenName: 'A', familyName: 'B', ahpraNumber: 'MED0001', ahpraVerificationStatus: 'failed' }),
    getGpPractice: async () => ({ id: 'gp-1', practiceName: 'X', hpiO: '8003600000000000', state: 'NSW', verificationStatus: 'failed', integrationTier: 'basic' }),
    ...overrides,
  } as OnboardingAccountClient;
}

describe('VerificationCasesService', () => {
  it('opens a wwcc case with no entityId and leaves it open, unrefreshed', async () => {
    const prisma = new FakePrisma();
    const service = new VerificationCasesService(prisma as any, fakeOnboardingAccountClient());

    const created = await service.open(
      { caseType: 'wwcc', subjectName: 'Pat Caseworker', subjectIdentifier: 'WWC1234E', issuingState: 'VIC' },
      STAFF,
    );

    expect(created.status).toBe('open');
    expect(created.lastRefreshedAt).toBeNull();
    expect(prisma.outbox).toHaveLength(1);
    expect(prisma.outbox[0].type).toBe('verification_case.opened');
  });

  it('opens an ahpra_specialist case and snapshots the automated status via onboarding-account', async () => {
    const prisma = new FakePrisma();
    const onboardingAccount = fakeOnboardingAccountClient({
      getSpecialist: async () => ({
        id: 'spec-1',
        givenName: 'A',
        familyName: 'B',
        ahpraNumber: 'MED0001',
        ahpraVerificationStatus: 'ahpra_verification_failed',
      }),
    });
    const service = new VerificationCasesService(prisma as any, onboardingAccount);

    const created = await service.open(
      { caseType: 'ahpra_specialist', entityType: 'Specialist', entityId: 'spec-1', subjectName: 'Dr A B' },
      STAFF,
    );

    expect(created.lastKnownAutomatedStatus).toBe('ahpra_verification_failed');
    expect(created.lastRefreshedAt).not.toBeNull();
  });

  it('refresh() is a no-op for a case with no entityId', async () => {
    const prisma = new FakePrisma();
    const service = new VerificationCasesService(prisma as any, fakeOnboardingAccountClient());
    const created = await service.open({ caseType: 'wwcc', subjectName: 'Pat' }, STAFF);

    const refreshed = await service.refresh(created.id);
    expect(refreshed.lastKnownAutomatedStatus).toBeNull();
  });

  it('approve() sets status, records the decision, and writes an outbox row', async () => {
    const prisma = new FakePrisma();
    const service = new VerificationCasesService(prisma as any, fakeOnboardingAccountClient());
    const created = await service.open({ caseType: 'wwcc', subjectName: 'Pat' }, STAFF);

    const approved = await service.approve(created.id, STAFF, 'Verified against VIC WWCC portal');

    expect(approved.status).toBe('approved');
    expect(approved.decidedByStaffId).toBe('staff-1');
    expect(approved.decisionNote).toBe('Verified against VIC WWCC portal');
    expect(prisma.outbox.map((e) => e.type)).toContain('verification_case.approved');
  });

  it('refuses to decide an already-decided case', async () => {
    const prisma = new FakePrisma();
    const service = new VerificationCasesService(prisma as any, fakeOnboardingAccountClient());
    const created = await service.open({ caseType: 'wwcc', subjectName: 'Pat' }, STAFF);
    await service.approve(created.id, STAFF);

    await expect(service.reject(created.id, STAFF)).rejects.toBeInstanceOf(ConflictException);
  });

  it('needsInfo() moves an open case to needs_info without deciding it', async () => {
    const prisma = new FakePrisma();
    const service = new VerificationCasesService(prisma as any, fakeOnboardingAccountClient());
    const created = await service.open({ caseType: 'wwcc', subjectName: 'Pat' }, STAFF);

    const updated = await service.needsInfo(created.id, STAFF, 'Need front/back photo of the check card');
    expect(updated.status).toBe('needs_info');

    // still decidable afterwards
    const approved = await service.approve(created.id, STAFF);
    expect(approved.status).toBe('approved');
  });

  it('getById() throws NotFoundException for an unknown id', async () => {
    const prisma = new FakePrisma();
    const service = new VerificationCasesService(prisma as any, fakeOnboardingAccountClient());
    await expect(service.getById('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('list() filters by status and caseType', async () => {
    const prisma = new FakePrisma();
    const service = new VerificationCasesService(prisma as any, fakeOnboardingAccountClient());
    const a = await service.open({ caseType: 'wwcc', subjectName: 'A' }, STAFF);
    await service.open({ caseType: 'ahpra_specialist', subjectName: 'B' }, STAFF);
    await service.approve(a.id, STAFF);

    expect(await service.list({ status: 'approved' })).toHaveLength(1);
    expect(await service.list({ caseType: 'ahpra_specialist' })).toHaveLength(1);
    expect(await service.list({})).toHaveLength(2);
  });
});
