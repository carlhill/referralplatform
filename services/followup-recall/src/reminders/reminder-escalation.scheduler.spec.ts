import { ReminderEscalationScheduler } from './reminder-escalation.scheduler';

interface PlanRow {
  id: string;
  patientId: string;
  status: string;
  nextReviewDueAt: Date;
}

interface ReminderRow {
  id: string;
  followUpPlanId: string;
  escalationLevel: number;
}

class FakePrisma {
  plans: PlanRow[] = [];
  reminders: ReminderRow[] = [];
  private counter = 0;

  followUpPlan = {
    findMany: async ({ where }: { where: { status: string; nextReviewDueAt: { lte: Date } } }) =>
      this.plans.filter((p) => p.status === where.status && p.nextReviewDueAt.getTime() <= where.nextReviewDueAt.lte.getTime()),
  };

  reminder = {
    findMany: async ({ where }: { where: { followUpPlanId: string; escalationLevel: { gt: number } } }) =>
      this.reminders.filter((r) => r.followUpPlanId === where.followUpPlanId && r.escalationLevel > where.escalationLevel.gt),
    createMany: async ({ data }: { data: Array<Partial<ReminderRow>> }) => {
      for (const item of data) {
        this.reminders.push({ id: `rem-${++this.counter}`, followUpPlanId: item.followUpPlanId!, escalationLevel: item.escalationLevel! });
      }
      return { count: data.length };
    },
  };
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

describe('ReminderEscalationScheduler', () => {
  let prisma: FakePrisma;
  let scheduler: ReminderEscalationScheduler;

  beforeEach(() => {
    prisma = new FakePrisma();
    scheduler = new ReminderEscalationScheduler(prisma as any);
  });

  it('raises a level-1 escalation wave (patient + gp) for a plan overdue with no escalation yet', async () => {
    prisma.plans = [{ id: 'plan-1', patientId: 'patient-1', status: 'active', nextReviewDueAt: daysAgo(1) }];

    await scheduler.escalateOverdue();

    const created = prisma.reminders.filter((r) => r.followUpPlanId === 'plan-1');
    expect(created).toHaveLength(2);
    created.forEach((r) => expect(r.escalationLevel).toBe(1));
  });

  it('does not raise level 2 before its own threshold (3 days after due date) has arrived', async () => {
    prisma.plans = [{ id: 'plan-1', patientId: 'patient-1', status: 'active', nextReviewDueAt: daysAgo(1) }];
    prisma.reminders = [{ id: 'existing-1', followUpPlanId: 'plan-1', escalationLevel: 1 }];

    await scheduler.escalateOverdue();

    expect(prisma.reminders).toHaveLength(1); // unchanged — level 2 not due yet (only 1 day since due date, needs 3)
  });

  it('raises level 2 once its 3-day-after-due-date threshold has arrived', async () => {
    prisma.plans = [{ id: 'plan-1', patientId: 'patient-1', status: 'active', nextReviewDueAt: daysAgo(4) }];
    prisma.reminders = [{ id: 'existing-1', followUpPlanId: 'plan-1', escalationLevel: 1 }];

    await scheduler.escalateOverdue();

    const level2 = prisma.reminders.filter((r) => r.escalationLevel === 2);
    expect(level2).toHaveLength(2);
  });

  it('ignores plans that are not yet overdue', async () => {
    prisma.plans = [
      { id: 'plan-1', patientId: 'patient-1', status: 'active', nextReviewDueAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) },
    ];
    // the fake mirrors the real Prisma `where` filter, so this plan is excluded before the scheduler even sees it
    await scheduler.escalateOverdue();
    expect(prisma.reminders).toHaveLength(0);
  });

  it('does not throw if the sweep fails outright', async () => {
    prisma.followUpPlan.findMany = async () => {
      throw new Error('db down');
    };
    await expect(scheduler.escalateOverdue()).resolves.toBeUndefined();
  });
});
