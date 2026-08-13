import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { ReferralService, QUEUE_WINDOW_MS, type ReferralRecord, type ComplianceFlagRow } from './referral.service';
import { ComplianceRulesService } from '../compliance-rules/compliance-rules.service';
import type { ComplianceRuleRecord } from '../compliance-rules/compliance-rule-types';
import { GpAuthorisationClient } from '../common/gp-authorisation.client';

/**
 * A small hand-rolled fake standing in for PrismaService, shaped exactly
 * like the calls ReferralService (and, transitively, ComplianceRulesService
 * — both share one Prisma connection/schema for real) actually make — the
 * same pattern services/gp-authorisation/src/gp-links/gp-links.service.spec.ts
 * uses. Includes the `complianceRule` table so `ComplianceRulesService.seedDefaults()`
 * /`evaluate()` work against this same fake, exactly as they would against
 * one real Postgres connection.
 */
class FakePrisma {
  referrals = new Map<string, ReferralRecord>();
  flags = new Map<string, ComplianceFlagRow>();
  rules = new Map<string, ComplianceRuleRecord>();
  outbox: Array<{
    type: string;
    actor: ActorRef;
    subjectType: string;
    subjectId: string;
    payload: Record<string, unknown>;
  }> = [];
  private counter = 0;

  complianceRule = {
    create: async ({ data }: { data: Partial<ComplianceRuleRecord> }) => {
      const id = `rule-${++this.counter}`;
      const now = new Date();
      const record: ComplianceRuleRecord = {
        id,
        category: data.category!,
        jurisdiction: data.jurisdiction!,
        version: data.version!,
        triggerCondition: data.triggerCondition!,
        checklistText: data.checklistText!,
        requiresWwcc: data.requiresWwcc ?? false,
        exemptForAhpraRegistered: data.exemptForAhpraRegistered ?? false,
        active: data.active ?? true,
        effectiveFrom: data.effectiveFrom ?? now,
        effectiveTo: data.effectiveTo ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.rules.set(id, record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<ComplianceRuleRecord> }) => {
      const existing = this.rules.get(where.id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data, updatedAt: new Date() } as ComplianceRuleRecord;
      this.rules.set(where.id, updated);
      return updated;
    },
    findFirst: async ({
      where,
    }: {
      where: { id?: string; category?: string; jurisdiction?: string; version?: string; active?: boolean };
    }) => {
      const all = [...this.rules.values()].filter(
        (r) =>
          (where.id ? r.id === where.id : true) &&
          (where.category ? r.category === where.category : true) &&
          (where.jurisdiction ? r.jurisdiction === where.jurisdiction : true) &&
          (where.version ? r.version === where.version : true) &&
          (where.active !== undefined ? r.active === where.active : true),
      );
      return all[0] ?? null;
    },
    findMany: async ({ where }: { where: { active?: boolean; category?: string; jurisdiction?: unknown } }) => {
      return [...this.rules.values()].filter((r) => {
        if (where.active !== undefined && r.active !== where.active) return false;
        if (where.category && r.category !== where.category) return false;
        if (where.jurisdiction) {
          const inList = (where.jurisdiction as { in?: string[] }).in;
          if (inList && !inList.includes(r.jurisdiction)) return false;
        }
        return true;
      });
    },
  };

  referral = {
    create: async ({ data }: { data: Partial<ReferralRecord> }) => {
      const id = `ref-${++this.counter}`;
      const now = new Date();
      const record: ReferralRecord = {
        id,
        patientId: data.patientId!,
        gpId: data.gpId!,
        specialistId: data.specialistId ?? null,
        status: data.status ?? 'queued',
        origin: data.origin!,
        urgent: data.urgent ?? false,
        reasonForReferral: data.reasonForReferral!,
        aiStructuredSummary: null,
        gpState: data.gpState!,
        patientIsMinor: data.patientIsMinor ?? false,
        dvIndicated: data.dvIndicated ?? false,
        complexCase: data.complexCase ?? false,
        consentGrants: data.consentGrants ?? [],
        queueExpiresAt: data.queueExpiresAt ?? null,
        lapsedAt: null,
        routedAt: data.routedAt ?? null,
        declinedAt: null,
        declinedReason: null,
        bookedAt: null,
        reviewStartedAt: null,
        resolvedEconsultAt: null,
        completedAt: null,
        cancelledAt: null,
        cancelledReason: null,
        createdAt: now,
        updatedAt: now,
      };
      this.referrals.set(id, record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<ReferralRecord> }) => {
      const existing = this.referrals.get(where.id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data, updatedAt: new Date() } as ReferralRecord;
      this.referrals.set(where.id, updated);
      return updated;
    },
    findUnique: async ({ where }: { where: { id: string } }) => this.referrals.get(where.id) ?? null,
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      const all = [...this.referrals.values()].filter((r) =>
        Object.entries(where).every(([k, v]) => (r as any)[k] === v),
      );
      return all[0] ?? null;
    },
    findMany: async ({ where }: { where: Record<string, unknown> }) => {
      return [...this.referrals.values()].filter((r) => {
        if (where.patientId && r.patientId !== where.patientId) return false;
        if (where.gpId && r.gpId !== where.gpId) return false;
        if (where.status && typeof where.status === 'string' && r.status !== where.status) return false;
        if (where.queueExpiresAt) {
          const lt = (where.queueExpiresAt as { lt?: Date }).lt;
          if (lt && !(r.queueExpiresAt && r.queueExpiresAt.getTime() < lt.getTime())) return false;
        }
        return true;
      });
    },
  };

  complianceFlag = {
    create: async ({ data }: { data: Partial<ComplianceFlagRow> }) => {
      const id = `flag-${++this.counter}`;
      const now = new Date();
      const flag: ComplianceFlagRow = {
        id,
        referralId: data.referralId!,
        category: data.category!,
        jurisdiction: data.jurisdiction!,
        rulesetVersion: data.rulesetVersion!,
        checklistPresentedAt: data.checklistPresentedAt ?? now,
        checklistAcknowledgedAt: null,
        acknowledgementNote: null,
        createdAt: now,
      };
      this.flags.set(id, flag);
      return flag;
    },
    findMany: async ({ where }: { where: { referralId?: string } }) =>
      [...this.flags.values()].filter((f) => (where.referralId ? f.referralId === where.referralId : true)),
    findFirst: async ({ where }: { where: { id?: string; referralId?: string } }) =>
      [...this.flags.values()].find(
        (f) => (where.id ? f.id === where.id : true) && (where.referralId ? f.referralId === where.referralId : true),
      ) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<ComplianceFlagRow> }) => {
      const existing = this.flags.get(where.id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data } as ComplianceFlagRow;
      this.flags.set(where.id, updated);
      return updated;
    },
  };

  auditOutbox = {
    create: async ({
      data,
    }: {
      data: { type: string; actor: ActorRef; subjectType: string; subjectId: string; payload: Record<string, unknown> };
    }) => {
      this.outbox.push(data);
      return data;
    },
  };

  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

const gpActor: ActorRef = { principalType: 'gp', id: 'gp-1' };
const specialistActor: ActorRef = { principalType: 'specialist', id: 'spec-1' };
const patientActor: ActorRef = { principalType: 'patient', id: 'patient-1' };

function baseDto(overrides: Record<string, unknown> = {}) {
  return {
    patientId: 'p1',
    gpId: 'gp1',
    origin: 'gp_in_practice',
    reasonForReferral: 'Suspected dermatological condition, please review',
    gpState: 'VIC',
    ...overrides,
  } as any;
}

describe('ReferralService', () => {
  let prisma: FakePrisma;
  let complianceRules: ComplianceRulesService;
  let gpAuth: { checkAuthorisation: jest.Mock };
  let service: ReferralService;

  beforeEach(async () => {
    prisma = new FakePrisma();
    complianceRules = new ComplianceRulesService(prisma as any);
    await complianceRules.seedDefaults();
    gpAuth = {
      checkAuthorisation: jest.fn().mockResolvedValue({ authorised: true, status: 'approved', linkId: 'link-1' }),
    };
    service = new ReferralService(prisma as any, complianceRules, gpAuth as unknown as GpAuthorisationClient);
  });

  it('blocks creation when the GP is not authorised for the patient', async () => {
    gpAuth.checkAuthorisation.mockResolvedValue({ authorised: false, status: 'no_link' });
    await expect(service.create(baseDto(), gpActor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.referrals.size).toBe(0);
  });

  it('skips the authorisation check when skipGpAuthorisationCheck is set', async () => {
    gpAuth.checkAuthorisation.mockResolvedValue({ authorised: false, status: 'no_link' });
    const referral = await service.create(baseDto({ skipGpAuthorisationCheck: true }), gpActor);
    expect(referral.id).toBeDefined();
    expect(gpAuth.checkAuthorisation).not.toHaveBeenCalled();
  });

  it('creates a referral in "queued" with a 2-day expiry when the patient account is not yet active', async () => {
    const before = Date.now();
    const referral = await service.create(baseDto(), gpActor);
    expect(referral.status).toBe('queued');
    expect(referral.queueExpiresAt).not.toBeNull();
    expect(referral.queueExpiresAt!.getTime()).toBeGreaterThanOrEqual(before + QUEUE_WINDOW_MS - 1000);
    expect(prisma.outbox.some((e) => e.type === 'referral.created')).toBe(true);
    expect(prisma.outbox.some((e) => e.type === 'referral.queued')).toBe(true);
  });

  it('creates a referral directly "routed" when the patient account is already active', async () => {
    const referral = await service.create(baseDto({ patientAccountActive: true }), gpActor);
    expect(referral.status).toBe('routed');
    expect(referral.queueExpiresAt).toBeNull();
    expect(referral.routedAt).not.toBeNull();
    expect(prisma.outbox.some((e) => e.type === 'referral.routed')).toBe(true);
  });

  it('preserves the urgent fast-path flag', async () => {
    const referral = await service.create(baseDto({ urgent: true, patientAccountActive: true }), gpActor);
    expect(referral.urgent).toBe(true);
  });

  it('raises compliance flags matching the Compliance Rules Engine and audits each one', async () => {
    const referral = await service.create(baseDto({ patientIsMinor: true, gpState: 'NSW' }), gpActor);
    expect(referral.complianceFlags.length).toBe(2); // child (ALL) + working_with_children_check (NSW, required)
    const wwcc = referral.complianceFlags.find((f) => f.category === 'working_with_children_check')!;
    expect(wwcc.jurisdiction).toBe('NSW');
    expect(wwcc.rulesetVersion).toBe('1.0.0');
    expect(
      prisma.outbox.filter(
        (e) => e.subjectType === 'ComplianceFlag' && (e.payload as any).event === 'compliance_flag.raised',
      ),
    ).toHaveLength(2);
  });

  it('raises no compliance flags when nothing is indicated', async () => {
    const referral = await service.create(baseDto(), gpActor);
    expect(referral.complianceFlags).toHaveLength(0);
  });

  it('getById throws NotFoundException for an unknown id', async () => {
    await expect(service.getById('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('acknowledges a compliance flag idempotently and audits it', async () => {
    const referral = await service.create(baseDto({ dvIndicated: true }), gpActor);
    const flag = referral.complianceFlags[0];
    const acked = await service.acknowledgeComplianceFlag(
      referral.id,
      flag.id,
      gpActor,
      'Safety assessed, patient consents',
    );
    expect(acked.checklistAcknowledgedAt).not.toBeNull();
    expect(
      prisma.outbox.some(
        (e) => e.type === 'consent.granted' && (e.payload as any).event === 'compliance_flag.acknowledged',
      ),
    ).toBe(true);

    const second = await service.acknowledgeComplianceFlag(referral.id, flag.id, gpActor);
    expect(second.checklistAcknowledgedAt?.getTime()).toBe(acked.checklistAcknowledgedAt?.getTime());
  });

  describe('state machine', () => {
    it('walks the full happy path: queued(active) -> routed -> booked -> in_review -> completed', async () => {
      const referral = await service.create(baseDto({ patientAccountActive: true }), gpActor);
      expect(referral.status).toBe('routed');

      const booked = await service.book(referral.id, specialistActor);
      expect(booked.status).toBe('booked');
      expect(booked.bookedAt).not.toBeNull();

      const inReview = await service.startReview(booked.id, specialistActor);
      expect(inReview.status).toBe('in_review');

      const completed = await service.complete(inReview.id, specialistActor);
      expect(completed.status).toBe('completed');
      expect(completed.completedAt).not.toBeNull();
    });

    it('supports the eConsult resolution branch', async () => {
      const referral = await service.create(baseDto({ patientAccountActive: true }), gpActor);
      await service.book(referral.id, specialistActor);
      await service.startReview(referral.id, specialistActor);
      const resolved = await service.resolveEconsult(referral.id, specialistActor);
      expect(resolved.status).toBe('resolved_econsult');
    });

    it('rejects an invalid transition (e.g. queued -> booked directly)', async () => {
      const referral = await service.create(baseDto(), gpActor);
      await expect(service.book(referral.id, specialistActor)).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows a specialist to decline a routed referral', async () => {
      const referral = await service.create(baseDto({ patientAccountActive: true }), gpActor);
      const declined = await service.decline(referral.id, specialistActor, 'Not appropriate for this specialty');
      expect(declined.status).toBe('declined');
      expect(declined.declinedReason).toBe('Not appropriate for this specialty');
    });

    it('allows cancellation from queued, routed, booked, and in_review, but not from a terminal state', async () => {
      const referral = await service.create(baseDto(), gpActor);
      const cancelled = await service.cancel(referral.id, patientActor, 'Patient changed mind');
      expect(cancelled.status).toBe('cancelled');
      await expect(service.cancel(referral.id, patientActor)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('the 2-day activation queue', () => {
    it('lazily lapses a referral whose queue window has passed when any transition is attempted', async () => {
      const referral = await service.create(baseDto(), gpActor);
      const stale = prisma.referrals.get(referral.id)!;
      stale.queueExpiresAt = new Date(Date.now() - 1000);

      await expect(service.book(referral.id, specialistActor)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.referrals.get(referral.id)!.status).toBe('lapsed');
      expect(prisma.outbox.some((e) => e.type === 'referral.lapsed')).toBe(true);
    });

    it('expireStaleQueuedReferrals sweeps every stale queued referral (resumability)', async () => {
      const a = await service.create(baseDto({ patientId: 'pA' }), gpActor);
      const b = await service.create(baseDto({ patientId: 'pB' }), gpActor);
      prisma.referrals.get(a.id)!.queueExpiresAt = new Date(Date.now() - 1000);
      prisma.referrals.get(b.id)!.queueExpiresAt = new Date(Date.now() + 1000 * 60 * 60);

      const count = await service.expireStaleQueuedReferrals();
      expect(count).toBe(1);
      expect(prisma.referrals.get(a.id)!.status).toBe('lapsed');
      expect(prisma.referrals.get(b.id)!.status).toBe('queued');
    });

    it('activateQueuedForPatient routes every queued referral for that patient', async () => {
      const a = await service.create(baseDto({ patientId: 'pA' }), gpActor);
      const b = await service.create(baseDto({ patientId: 'pA' }), gpActor);
      const other = await service.create(baseDto({ patientId: 'pOther' }), gpActor);

      const routed = await service.activateQueuedForPatient('pA', {
        principalType: 'system',
        id: 'onboarding-account-service',
      });
      expect(routed).toBe(2);
      expect(prisma.referrals.get(a.id)!.status).toBe('routed');
      expect(prisma.referrals.get(b.id)!.status).toBe('routed');
      expect(prisma.referrals.get(other.id)!.status).toBe('queued');
    });
  });

  describe('list', () => {
    it('filters by patientId, gpId, and status', async () => {
      await service.create(baseDto({ patientId: 'p1', gpId: 'gpA' }), gpActor);
      await service.create(baseDto({ patientId: 'p2', gpId: 'gpA', patientAccountActive: true }), gpActor);

      expect(await service.list({ patientId: 'p1' })).toHaveLength(1);
      expect(await service.list({ gpId: 'gpA' })).toHaveLength(2);
      expect(await service.list({ status: 'routed' })).toHaveLength(1);
    });
  });
});
