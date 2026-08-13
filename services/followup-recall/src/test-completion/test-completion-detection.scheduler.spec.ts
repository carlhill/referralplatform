import { TestCompletionDetectionScheduler } from './test-completion-detection.scheduler';
import type { FollowUpPlansService, FollowUpPlanRecord } from '../follow-up-plans/follow-up-plans.service';

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function makePlan(overrides: Partial<FollowUpPlanRecord> = {}): FollowUpPlanRecord {
  return {
    id: 'plan-1',
    referralId: 'ref-1',
    patientId: 'patient-1',
    gpId: 'gp-1',
    status: 'active',
    referralType: 'pathology_recheck',
    nextReviewDueAt: daysAgo(1),
    requiredTests: ['HbA1c'],
    indefiniteReferralApplies: false,
    testCompletionDetectedVia: null,
    testCompletedAt: null,
    gpCourtesyCallDueAt: null,
    gpCourtesyCallCompletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('TestCompletionDetectionScheduler', () => {
  let plans: jest.Mocked<Pick<FollowUpPlansService, 'listActive' | 'recordTestCompletion'>>;
  let scheduler: TestCompletionDetectionScheduler;

  beforeEach(() => {
    plans = {
      listActive: jest.fn().mockResolvedValue([]),
      recordTestCompletion: jest.fn().mockResolvedValue(makePlan({ status: 'completed' })),
    };
    scheduler = new TestCompletionDetectionScheduler(plans as unknown as FollowUpPlansService);
  });

  it('marks a plan completed via pathology_e_result once its (pathology-eligible) test has "turned around"', async () => {
    plans.listActive.mockResolvedValueOnce([makePlan({ nextReviewDueAt: daysAgo(3), requiredTests: ['HbA1c'] })]);

    await scheduler.sweep();

    expect(plans.recordTestCompletion).toHaveBeenCalledTimes(1);
    expect(plans.recordTestCompletion).toHaveBeenCalledWith(
      'plan-1',
      'pathology_e_result',
      expect.objectContaining({ principalType: 'system' }),
      expect.objectContaining({ testName: 'HbA1c' }),
    );
  });

  it('falls back to my_health_record for an imaging test the pathology mock never covers', async () => {
    plans.listActive.mockResolvedValueOnce([
      makePlan({ nextReviewDueAt: daysAgo(5), requiredTests: ['chest X-ray'] }),
    ]);

    await scheduler.sweep();

    expect(plans.recordTestCompletion).toHaveBeenCalledWith(
      'plan-1',
      'my_health_record',
      expect.anything(),
      expect.objectContaining({ testName: 'chest X-ray' }),
    );
  });

  it('does nothing for a plan whose test has not turned around yet', async () => {
    plans.listActive.mockResolvedValueOnce([makePlan({ nextReviewDueAt: daysAgo(0), requiredTests: ['HbA1c'] })]);

    await scheduler.sweep();

    expect(plans.recordTestCompletion).not.toHaveBeenCalled();
  });

  it('skips a plan with no named required tests — nothing to auto-detect', async () => {
    plans.listActive.mockResolvedValueOnce([makePlan({ nextReviewDueAt: daysAgo(10), requiredTests: [] })]);

    await scheduler.sweep();

    expect(plans.recordTestCompletion).not.toHaveBeenCalled();
  });

  it('does not throw if recordTestCompletion fails for one plan — logs and continues', async () => {
    plans.listActive.mockResolvedValueOnce([makePlan({ nextReviewDueAt: daysAgo(3) })]);
    plans.recordTestCompletion.mockRejectedValueOnce(new Error('db down'));

    await expect(scheduler.sweep()).resolves.toBeUndefined();
  });
});
