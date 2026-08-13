import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { FollowUpPlansService, type FollowUpPlanRecord } from './follow-up-plans.service';
import { CreateFollowUpPlanDto } from './dto/create-follow-up-plan.dto';

interface ReminderRow {
  id: string;
  followUpPlanId: string;
  patientId: string;
  recipientType: string;
  channel: string;
  scheduledFor: Date;
  status: string;
  escalationLevel: number;
}

interface OutboxRow {
  type: string;
  actor: ActorRef;
  subjectType: string;
  subjectId: string;
  payload: Record<string, unknown>;
}

/** A small hand-rolled fake standing in for PrismaService — same pattern services/referral/src/referral/referral.service.spec.ts uses. */
class FakePrisma {
  plans = new Map<string, FollowUpPlanRecord>();
  reminders = new Map<string, ReminderRow>();
  suppressions = new Map<string, { patientId: string; active: boolean }>();
  outbox: OutboxRow[] = [];
  private counter = 0;

  followUpPlan = {
    create: async ({ data }: { data: Partial<FollowUpPlanRecord> }) => {
      const id = `plan-${++this.counter}`;
      const now = new Date();
      const record: FollowUpPlanRecord = {
        id,
        referralId: data.referralId!,
        patientId: data.patientId!,
        gpId: data.gpId!,
        status: 'active',
        referralType: data.referralType!,
        nextReviewDueAt: data.nextReviewDueAt!,
        requiredTests: data.requiredTests ?? [],
        indefiniteReferralApplies: data.indefiniteReferralApplies ?? false,
        testCompletionDetectedVia: null,
        testCompletedAt: null,
        gpCourtesyCallDueAt: data.gpCourtesyCallDueAt ?? null,
        gpCourtesyCallCompletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.plans.set(id, record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<FollowUpPlanRecord> }) => {
      const existing = this.plans.get(where.id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data, updatedAt: new Date() } as FollowUpPlanRecord;
      this.plans.set(where.id, updated);
      return updated;
    },
    findUnique: async ({ where }: { where: { id: string } }) => this.plans.get(where.id) ?? null,
    findMany: async ({ where }: { where: { patientId?: string; status?: string } }) => {
      return [...this.plans.values()].filter(
        (p) =>
          (where.patientId ? p.patientId === where.patientId : true) &&
          (where.status ? p.status === where.status : true),
      );
    },
  };

  reminder = {
    createMany: async ({ data }: { data: Array<Partial<ReminderRow>> }) => {
      for (const item of data) {
        const id = `rem-${++this.counter}`;
        this.reminders.set(id, {
          id,
          followUpPlanId: item.followUpPlanId!,
          patientId: item.patientId!,
          recipientType: item.recipientType!,
          channel: item.channel!,
          scheduledFor: item.scheduledFor!,
          status: 'scheduled',
          escalationLevel: item.escalationLevel ?? 0,
        });
      }
      return { count: data.length };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { followUpPlanId?: string; status?: string };
      data: Partial<ReminderRow>;
    }) => {
      let count = 0;
      for (const r of this.reminders.values()) {
        if (
          (where.followUpPlanId ? r.followUpPlanId === where.followUpPlanId : true) &&
          (where.status ? r.status === where.status : true)
        ) {
          Object.assign(r, data);
          count += 1;
        }
      }
      return { count };
    },
  };

  deceasedSuppression = {
    findUnique: async ({ where }: { where: { patientId: string } }) => this.suppressions.get(where.patientId) ?? null,
  };

  auditOutbox = {
    create: async ({ data }: { data: OutboxRow }) => {
      this.outbox.push(data);
      return data;
    },
  };

  $transaction = async <T>(fn: (tx: this) => Promise<T>): Promise<T> => fn(this);
}

function makeDto(overrides: Partial<CreateFollowUpPlanDto> = {}): CreateFollowUpPlanDto {
  const dto = new CreateFollowUpPlanDto();
  dto.referralId = '11111111-1111-1111-1111-111111111111';
  dto.patientId = 'patient-1';
  dto.gpId = 'gp-1';
  dto.referralType = 'pathology_recheck';
  dto.nextReviewDueAt = '2026-12-01T00:00:00.000Z';
  dto.requiredTests = ['HbA1c'];
  dto.indefiniteReferralApplies = false;
  return Object.assign(dto, overrides);
}

const actor: ActorRef = { principalType: 'specialist', id: 'specialist-1', displayName: 'Dr Test' };

describe('FollowUpPlansService', () => {
  let prisma: FakePrisma;
  let service: FollowUpPlansService;

  beforeEach(() => {
    prisma = new FakePrisma();
    service = new FollowUpPlansService(prisma as any);
  });

  describe('create', () => {
    it('creates a Follow-up Plan, schedules the initial reminder cadence, and writes an audit outbox row', async () => {
      const plan = await service.create(makeDto(), actor);

      expect(plan.status).toBe('active');
      expect(plan.referralType).toBe('pathology_recheck');
      expect(prisma.reminders.size).toBe(4);
      [...prisma.reminders.values()].forEach((r) => {
        expect(r.followUpPlanId).toBe(plan.id);
        expect(r.status).toBe('scheduled');
      });

      expect(prisma.outbox).toHaveLength(1);
      expect(prisma.outbox[0].type).toBe('followup.plan.created');
      expect(prisma.outbox[0].subjectId).toBe(plan.id);
    });

    it('refuses to create a plan for a patient already flagged deceased', async () => {
      prisma.suppressions.set('patient-1', { patientId: 'patient-1', active: true });
      await expect(service.create(makeDto(), actor)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.plans.size).toBe(0);
    });
  });

  describe('findById', () => {
    it('throws NotFoundException for an unknown id', async () => {
      await expect(service.findById('does-not-exist')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listForPatient', () => {
    it('filters by patientId and optional status', async () => {
      await service.create(makeDto({ patientId: 'patient-1' }), actor);
      await service.create(makeDto({ patientId: 'patient-1', referralType: 'imaging_recheck' }), actor);
      await service.create(makeDto({ patientId: 'patient-2' }), actor);

      const forPatient1 = await service.listForPatient('patient-1');
      expect(forPatient1).toHaveLength(2);

      await service.recordTestCompletion(forPatient1[0].id, 'patient_self_report', actor);
      const stillActive = await service.listForPatient('patient-1', 'active');
      expect(stillActive).toHaveLength(1);
    });
  });

  describe('recordTestCompletion', () => {
    it('marks the plan completed and cancels every remaining scheduled reminder', async () => {
      const plan = await service.create(makeDto(), actor);

      const completed = await service.recordTestCompletion(plan.id, 'pathology_e_result', actor, {
        testName: 'HbA1c',
      });

      expect(completed.status).toBe('completed');
      expect(completed.testCompletionDetectedVia).toBe('pathology_e_result');
      expect(completed.testCompletedAt).not.toBeNull();

      const remindersForPlan = [...prisma.reminders.values()].filter((r) => r.followUpPlanId === plan.id);
      remindersForPlan.forEach((r) => expect(r.status).toBe('cancelled'));

      const completionEvent = prisma.outbox.find((e) => e.type === 'followup.plan.completed');
      expect(completionEvent).toBeDefined();
      expect(completionEvent!.payload.detectedVia).toBe('pathology_e_result');
    });

    it('is idempotent for an already-completed plan (returns existing record, no duplicate audit event)', async () => {
      const plan = await service.create(makeDto(), actor);
      await service.recordTestCompletion(plan.id, 'patient_self_report', actor);
      const outboxCountAfterFirst = prisma.outbox.length;

      const secondCall = await service.recordTestCompletion(plan.id, 'pathology_e_result', actor);
      expect(secondCall.status).toBe('completed');
      expect(secondCall.testCompletionDetectedVia).toBe('patient_self_report'); // unchanged — first report wins
      expect(prisma.outbox).toHaveLength(outboxCountAfterFirst);
    });

    it('refuses to complete a plan already suppressed for a deceased patient', async () => {
      const plan = await service.create(makeDto(), actor);
      prisma.plans.set(plan.id, { ...plan, status: 'suppressed_deceased' });

      await expect(service.recordTestCompletion(plan.id, 'patient_self_report', actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws NotFoundException for an unknown plan id', async () => {
      await expect(service.recordTestCompletion('nope', 'patient_self_report', actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
