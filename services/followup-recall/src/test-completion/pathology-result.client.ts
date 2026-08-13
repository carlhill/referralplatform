import { Injectable } from '@nestjs/common';

export interface TestResultCheck {
  testName: string;
  resultAvailable: boolean;
  resultDate?: string;
}

/**
 * MOCK — replace with real integration.
 *
 * A real implementation would call a pathology e-ordering/e-results vendor
 * (e.g. Healthlink, Medical-Objects, or a direct HL7/FHIR DiagnosticReport
 * feed from a pathology provider) — this requires real-world vendor
 * credentials this build does not have, so per this task's ground rules
 * it's implemented behind this interface with a working, clearly-labelled
 * mock instead of faked as a real integration.
 *
 * Mock behaviour (deterministic, no network/randomness): a test is
 * considered to have an available e-result once `now` is at least
 * `AVAILABLE_AFTER_DAYS` days past the Follow-up Plan's `nextReviewDueAt`
 * — modelling "most patients complete their test at/shortly after the due
 * date, and pathology turnaround is a couple of days" — AND the test name
 * looks like a pathology/blood test rather than an imaging study (see
 * `looksLikePathologyTest`). That second condition is a deliberate,
 * documented mock simplification modelling a real distinction: a pathology
 * e-results feed carries blood/lab tests, not radiology reports — imaging
 * results (X-ray/CT/MRI/ultrasound) typically reach the platform via a
 * radiology provider's My Health Record upload instead, which is exactly
 * what makes `MockMyHealthRecordClient` a genuinely different second
 * source rather than a redundant duplicate of this one (see
 * TestCompletionDetectionScheduler, which checks this client first and
 * falls back to My Health Record). This is enough for the scheduler's
 * sweep to actually observe both kinds of automatic detection in a
 * running/tested system without a real lab or MHR connection in the loop,
 * while staying honest that it is not reading any real result.
 */
export interface PathologyResultClient {
  checkForResults(
    patientId: string,
    testNames: string[],
    nextReviewDueAt: Date,
    now: Date,
  ): Promise<TestResultCheck[]>;
}

const IMAGING_TEST_PATTERN = /x-?ray|\bscan\b|\bmri\b|\bct\b|ultrasound|imaging/i;

function looksLikePathologyTest(testName: string): boolean {
  return !IMAGING_TEST_PATTERN.test(testName);
}

@Injectable()
export class MockPathologyResultClient implements PathologyResultClient {
  private static readonly AVAILABLE_AFTER_DAYS = 2;

  async checkForResults(
    _patientId: string,
    testNames: string[],
    nextReviewDueAt: Date,
    now: Date,
  ): Promise<TestResultCheck[]> {
    const daysSinceDue = (now.getTime() - nextReviewDueAt.getTime()) / (24 * 60 * 60 * 1000);
    const resultDate = new Date(
      nextReviewDueAt.getTime() + MockPathologyResultClient.AVAILABLE_AFTER_DAYS * 24 * 60 * 60 * 1000,
    );
    return testNames.map((testName) => {
      const available = looksLikePathologyTest(testName) && daysSinceDue >= MockPathologyResultClient.AVAILABLE_AFTER_DAYS;
      return { testName, resultAvailable: available, resultDate: available ? resultDate.toISOString() : undefined };
    });
  }
}
