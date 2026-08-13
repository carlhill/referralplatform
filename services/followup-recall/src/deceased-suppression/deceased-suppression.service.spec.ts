import { DeceasedSuppressionService } from './deceased-suppression.service';

interface PlanRow {
  id: string;
  patientId: string;
  status: string;
}

interface ReminderRow {
  id: string;
  followUpPlanId: string;
  patientId: string;
  status: string;
  suppressedAt?: Date;
  suppressedReason?: string;
}

class FakePrisma {
  plans = new Map<string, PlanRow>();
  reminders = new Map<string, ReminderRow>();
  suppressions = new Map<string, { patientId: string; active: boolean; sourceFlagId?: string }>();
  outbox: Array<{ type: string; subjectId: string; payload: Record<string, unknown> }> = [];

  followUpPlan = {
    findMany: async ({ where }: { where: { patientId: string; status: string } }) =>
      [...this.plans.values()].filter((p) => p.patientId === where.patientId && p.status === where.status),
    updateMany: async ({
      where,
      data,
    }: {
      where: { followUpPlanId?: string; status?: string; patientId?: string };
      data: Partial<PlanRow>;
    }) => {
      let count = 0;
      for (const p of this.plans.values()) {
        if (
          (where.patientId ? p.patientId === where.patientId : true) &&
          (where.status ? p.status === where.status : true)
        ) {
          Object.assign(p, data);
          count += 1;
        }
      }
      return { count };
    },
  };

  reminder = {
    updateMany: async ({
      where,
      data,
    }: {
      where: { followUpPlanId?: string; patientId?: string; status?: string };
      data: Partial<ReminderRow>;
    }) => {
      let count = 0;
      for (const r of this.reminders.values()) {
        if (
          (where.followUpPlanId ? r.followUpPlanId === where.followUpPlanId : true) &&
          (where.patientId ? r.patientId === where.patientId : true) &&
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
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { patientId: string };
      create: { patientId: string; active: boolean; sourceFlagId?: string };
      update: { active: boolean; sourceFlagId?: string };
    }) => {
      const existing = this.suppressions.get(where.patientId);
      const record = existing ? { ...existing, ...update } : { ...create };
      this.suppressions.set(where.patientId, record);
      return record;
    },
  };

  auditOutbox = {
    create: async ({ data }: { data: { type: string; subjectId: string; payload: Record<string, unknown> } }) => {
      this.outbox.push(data);
      return data;
    },
  };

  $transaction = async <T>(fn: (tx: this) => Promise<T>): Promise<T> => fn(this);
}

function seedPlanWithReminders(
  prisma: FakePrisma,
  planId: string,
  patientId: string,
  planStatus: string,
  reminderStatuses: string[],
): void {
  prisma.plans.set(planId, { id: planId, patientId, status: planStatus });
  reminderStatuses.forEach((status, i) => {
    const id = `${planId}-rem-${i}`;
    prisma.reminders.set(id, { id, followUpPlanId: planId, patientId, status });
  });
}

describe('DeceasedSuppressionService.suppressAllForPatient', () => {
  let prisma: FakePrisma;
  let service: DeceasedSuppressionService;

  beforeEach(() => {
    prisma = new FakePrisma();
    service = new DeceasedSuppressionService(prisma as any);
  });

  it('suppresses every active plan and every scheduled (already-scheduled-but-not-yet-sent) reminder for the patient', async () => {
    seedPlanWithReminders(prisma, 'plan-1', 'patient-1', 'active', ['scheduled', 'scheduled', 'sent']);
    seedPlanWithReminders(prisma, 'plan-2', 'patient-1', 'active', ['scheduled']);
    seedPlanWithReminders(prisma, 'plan-3', 'patient-2', 'active', ['scheduled']); // different patient — untouched

    const result = await service.suppressAllForPatient('patient-1', 'flag-1');

    expect(result.plansSuppressed).toBe(2);
    expect(result.remindersSuppressed).toBe(3); // 2 scheduled in plan-1 + 1 in plan-2

    expect(prisma.plans.get('plan-1')!.status).toBe('suppressed_deceased');
    expect(prisma.plans.get('plan-2')!.status).toBe('suppressed_deceased');
    expect(prisma.plans.get('plan-3')!.status).toBe('active'); // patient-2 untouched

    // the "sent" reminder is left alone — it already went out before the freeze
    const sentReminder = [...prisma.reminders.values()].find((r) => r.followUpPlanId === 'plan-1' && r.status === 'sent');
    expect(sentReminder).toBeDefined();

    const stillScheduled = [...prisma.reminders.values()].filter((r) => r.status === 'scheduled');
    expect(stillScheduled.every((r) => r.patientId !== 'patient-1')).toBe(true);

    const suppressed = [...prisma.reminders.values()].filter((r) => r.status === 'suppressed');
    suppressed.forEach((r) => {
      expect(r.suppressedReason).toBe('patient_deceased');
      expect(r.suppressedAt).toBeInstanceOf(Date);
    });

    // records the suppression flag in the local cache
    expect(prisma.suppressions.get('patient-1')).toEqual(
      expect.objectContaining({ patientId: 'patient-1', active: true, sourceFlagId: 'flag-1' }),
    );

    // audits once per suppressed plan
    const suppressionEvents = prisma.outbox.filter((e) => e.type === 'followup.reminder.suppressed');
    expect(suppressionEvents).toHaveLength(2);
  });

  it('is idempotent — a second call for the same already-suppressed patient finds nothing left to do', async () => {
    seedPlanWithReminders(prisma, 'plan-1', 'patient-1', 'active', ['scheduled']);

    const first = await service.suppressAllForPatient('patient-1', 'flag-1');
    expect(first.plansSuppressed).toBe(1);

    const second = await service.suppressAllForPatient('patient-1', 'flag-1');
    expect(second.plansSuppressed).toBe(0);
    expect(second.remindersSuppressed).toBe(0);
  });

  it('does not touch plans/reminders for other patients', async () => {
    seedPlanWithReminders(prisma, 'plan-1', 'patient-1', 'active', ['scheduled']);
    seedPlanWithReminders(prisma, 'plan-2', 'patient-2', 'active', ['scheduled']);

    await service.suppressAllForPatient('patient-1', undefined);

    expect(prisma.plans.get('plan-2')!.status).toBe('active');
    expect([...prisma.reminders.values()].find((r) => r.followUpPlanId === 'plan-2')!.status).toBe('scheduled');
  });
});
