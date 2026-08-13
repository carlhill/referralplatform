import { Injectable } from '@nestjs/common';
import type { TestResultCheck } from './pathology-result.client';

/**
 * MOCK — replace with real integration.
 *
 * A real implementation would query the My Health Record (MHR) national
 * system (via the National Infrastructure/B2B gateway, NASH-authenticated)
 * for a matching uploaded pathology/diagnostic-imaging document — this
 * requires real MHR provider connectivity and NASH credentials this build
 * does not have, so per this task's ground rules it's implemented behind
 * this interface with a working, clearly-labelled mock instead.
 *
 * Mock behaviour mirrors `MockPathologyResultClient` but with a longer
 * `AVAILABLE_AFTER_DAYS` — modelling that a document reaching My Health
 * Record (uploaded by the pathology provider, then synced to MHR) tends to
 * lag a direct pathology e-result feed. `TestCompletionDetectionScheduler`
 * checks the pathology client first and falls back to this one, so which
 * source "wins" in the mock reflects a plausible real ordering, not an
 * arbitrary one.
 */
export interface MyHealthRecordClient {
  checkForResults(
    patientId: string,
    testNames: string[],
    nextReviewDueAt: Date,
    now: Date,
  ): Promise<TestResultCheck[]>;
}

@Injectable()
export class MockMyHealthRecordClient implements MyHealthRecordClient {
  private static readonly AVAILABLE_AFTER_DAYS = 4;

  async checkForResults(
    _patientId: string,
    testNames: string[],
    nextReviewDueAt: Date,
    now: Date,
  ): Promise<TestResultCheck[]> {
    const daysSinceDue = (now.getTime() - nextReviewDueAt.getTime()) / (24 * 60 * 60 * 1000);
    const available = daysSinceDue >= MockMyHealthRecordClient.AVAILABLE_AFTER_DAYS;
    const resultDate = new Date(
      nextReviewDueAt.getTime() + MockMyHealthRecordClient.AVAILABLE_AFTER_DAYS * 24 * 60 * 60 * 1000,
    );
    return testNames.map((testName) => ({
      testName,
      resultAvailable: available,
      resultDate: available ? resultDate.toISOString() : undefined,
    }));
  }
}
