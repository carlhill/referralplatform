import { ReminderDispatchScheduler } from './reminder-dispatch.scheduler';
import type { ConsentSecurityClient } from '../common/consent-security.client';
import type { DeceasedSuppressionService } from '../deceased-suppression/deceased-suppression.service';

interface DueRow {
  id: string;
  followUpPlanId: string;
  patientId: string;
  recipientType: string;
  channel: string;
  escalationLevel: number;
  followUpPlan: { id: string; status: string; referralType: string; nextReviewDueAt: Date; requiredTests: string[] };
}

class FakePrisma {
  due: DueRow[] = [];
  updates: Array<{ id: string; data: Record<string, unknown> }> = [];

  reminder = {
    findMany: async () => this.due,
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      this.updates.push({ id: where.id, data });
      return { id: where.id, ...data };
    },
  };
}

function makeRow(overrides: Partial<DueRow> = {}): DueRow {
  return {
    id: 'rem-1',
    followUpPlanId: 'plan-1',
    patientId: 'patient-1',
    recipientType: 'patient',
    channel: 'sms',
    escalationLevel: 0,
    followUpPlan: {
      id: 'plan-1',
      status: 'active',
      referralType: 'pathology_recheck',
      nextReviewDueAt: new Date(),
      requiredTests: ['HbA1c'],
    },
    ...overrides,
  };
}

describe('ReminderDispatchScheduler', () => {
  let prisma: FakePrisma;
  let consentSecurity: jest.Mocked<Pick<ConsentSecurityClient, 'isPatientDeceased'>>;
  let suppression: jest.Mocked<Pick<DeceasedSuppressionService, 'suppressAllForPatient'>>;
  let scheduler: ReminderDispatchScheduler;

  beforeEach(() => {
    prisma = new FakePrisma();
    consentSecurity = { isPatientDeceased: jest.fn().mockResolvedValue(false) };
    suppression = { suppressAllForPatient: jest.fn().mockResolvedValue({ plansSuppressed: 0, remindersSuppressed: 0 }) };
    scheduler = new ReminderDispatchScheduler(prisma as any, consentSecurity as any, suppression as any);
  });

  it('sends every due reminder and marks it sent', async () => {
    prisma.due = [makeRow({ id: 'rem-1' }), makeRow({ id: 'rem-2', channel: 'email' })];

    await scheduler.dispatchDue();

    expect(prisma.updates).toHaveLength(2);
    prisma.updates.forEach((u) => expect(u.data.status).toBe('sent'));
  });

  it('does a live deceased check before sending, and refuses to send + triggers suppression if it comes back positive', async () => {
    prisma.due = [makeRow({ id: 'rem-1', patientId: 'patient-1' })];
    consentSecurity.isPatientDeceased.mockResolvedValueOnce(true);

    await scheduler.dispatchDue();

    expect(suppression.suppressAllForPatient).toHaveBeenCalledWith('patient-1', undefined, expect.anything());
    // no "sent" update was made for the suppressed reminder — suppressAllForPatient handles the row directly
    expect(prisma.updates.find((u) => u.id === 'rem-1' && u.data.status === 'sent')).toBeUndefined();
  });

  it('deduplicates the live deceased check per patient within one dispatch batch', async () => {
    prisma.due = [
      makeRow({ id: 'rem-1', patientId: 'patient-1', recipientType: 'patient' }),
      makeRow({ id: 'rem-2', patientId: 'patient-1', recipientType: 'gp' }),
    ];

    await scheduler.dispatchDue();

    expect(consentSecurity.isPatientDeceased).toHaveBeenCalledTimes(1);
  });

  it('does not throw if dispatch fails outright — logs and lets the next tick retry', async () => {
    prisma.reminder.findMany = async () => {
      throw new Error('db down');
    };
    await expect(scheduler.dispatchDue()).resolves.toBeUndefined();
  });
});
