import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

/**
 * Payload shape for the automatic-detection webhook — see
 * test-completion/pathology-result.client.ts and
 * test-completion/my-health-record.client.ts (both MOCK) for the two
 * sources this represents, and
 * test-completion/test-completion-detection.scheduler.ts for the poller
 * that actually calls those mocks and, on a hit, POSTs this same shape into
 * `FollowUpPlansService.recordTestCompletion` — kept as a real DTO/endpoint
 * (not just an internal method call) so a *real* pathology/My Health Record
 * integration can push results in here directly later without the polling
 * detour, without changing FollowUpPlansService's contract.
 */
export class TestResultWebhookDto {
  @IsIn(['pathology_e_result', 'my_health_record'])
  detectedVia!: 'pathology_e_result' | 'my_health_record';

  @IsOptional()
  @IsString()
  testName?: string;

  @IsOptional()
  @IsISO8601()
  resultDate?: string;
}
