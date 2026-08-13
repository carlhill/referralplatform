import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { ActorRef } from '@referralplatform/shared-types';
import { FollowUpPlansService } from '../follow-up-plans/follow-up-plans.service';
import { MockPathologyResultClient, type PathologyResultClient } from './pathology-result.client';
import { MockMyHealthRecordClient, type MyHealthRecordClient } from './my-health-record.client';

const SYSTEM_ACTOR: ActorRef = {
  principalType: 'system',
  id: 'followup-recall-test-completion-detection',
  displayName: 'Follow-up & Recall Service — automatic test-completion detection',
};

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // same cadence as ReferralQueueExpiryScheduler's sweep

/**
 * business-process-flow.md module 6: "Test completed? -> Detected
 * automatically (pathology e-result / My Health Record) -> Follow-up Plan
 * marked complete." Runs every 5 minutes; for each still-`active` plan,
 * checks the mock pathology e-result client first, then the mock My Health
 * Record client as a second source, and marks the plan complete via
 * `FollowUpPlansService.recordTestCompletion` on the first hit — which also
 * cancels any remaining scheduled reminders for that plan in the same
 * transaction.
 *
 * Real pathology/MHR integrations are typically event-driven (a webhook or
 * a queue message when a new result posts), not polled — this periodic
 * sweep is the honest MVP shape given the mock clients don't have a real
 * event source to subscribe to yet. `FollowUpPlansController.testResult`
 * (`POST /follow-up-plans/:id/test-result`) is the webhook-shaped endpoint
 * a real push integration would call directly instead of relying on this
 * sweep at all — this scheduler calls `FollowUpPlansService` directly
 * rather than looping back through its own HTTP API.
 */
@Injectable()
export class TestCompletionDetectionScheduler {
  private readonly logger = new Logger(TestCompletionDetectionScheduler.name);
  private readonly pathologyClient: PathologyResultClient;
  private readonly myHealthRecordClient: MyHealthRecordClient;

  constructor(private readonly plans: FollowUpPlansService) {
    // MOCK — replace with real integrations; see the two client files.
    this.pathologyClient = new MockPathologyResultClient();
    this.myHealthRecordClient = new MockMyHealthRecordClient();
  }

  @Interval(SWEEP_INTERVAL_MS)
  async sweep(): Promise<void> {
    try {
      const now = new Date();
      const activePlans = await this.plans.listActive();
      let completedCount = 0;

      for (const plan of activePlans) {
        if (plan.requiredTests.length === 0) {
          continue; // nothing to auto-detect for a plan with no named tests (e.g. a pure GP-managed recall)
        }

        const pathologyHits = await this.pathologyClient.checkForResults(
          plan.patientId,
          plan.requiredTests,
          plan.nextReviewDueAt,
          now,
        );
        const pathologyHit = pathologyHits.find((r) => r.resultAvailable);
        if (pathologyHit) {
          await this.plans.recordTestCompletion(plan.id, 'pathology_e_result', SYSTEM_ACTOR, {
            testName: pathologyHit.testName,
            resultDate: pathologyHit.resultDate,
          });
          completedCount += 1;
          continue;
        }

        const mhrHits = await this.myHealthRecordClient.checkForResults(
          plan.patientId,
          plan.requiredTests,
          plan.nextReviewDueAt,
          now,
        );
        const mhrHit = mhrHits.find((r) => r.resultAvailable);
        if (mhrHit) {
          await this.plans.recordTestCompletion(plan.id, 'my_health_record', SYSTEM_ACTOR, {
            testName: mhrHit.testName,
            resultDate: mhrHit.resultDate,
          });
          completedCount += 1;
        }
      }

      if (completedCount > 0) {
        this.logger.log(`Automatically detected test completion for ${completedCount} Follow-up Plan(s)`);
      }
    } catch (err) {
      this.logger.error(
        'Failed to sweep active Follow-up Plans for automatic test-completion detection',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
