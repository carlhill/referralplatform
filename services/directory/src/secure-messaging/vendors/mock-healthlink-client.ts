import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type {
  SecureMessageSendRequest,
  SecureMessageSendResult,
  SecureMessagingVendorClient,
} from './vendor-client.interface';
import { SecureMessagingVendorError } from './vendor-error';

/**
 * MOCK — replace with real integration.
 *
 * HealthLink is a real Australian secure clinical messaging vendor whose
 * API requires a vendor agreement and production credentials this build
 * does not have. This mock simulates a realistic vendor integration:
 *  - deterministic failure when `recipientEndpointId` contains "FAIL"
 *    (a small, test-friendly way to exercise the failure path without
 *    relying on randomness in unit tests / CI);
 *  - otherwise a configurable random failure rate
 *    (`HEALTHLINK_MOCK_FAILURE_RATE`, default 0) so manual/local testing can
 *    exercise the delivery-failure exception path realistically.
 *
 * Swap this for a real HealthLink API client once vendor credentials exist —
 * `SecureMessagingService`'s call site doesn't need to change shape, only
 * the `HEALTHLINK_CLIENT` provider binding in `secure-messaging.module.ts`.
 */
@Injectable()
export class MockHealthLinkClient implements SecureMessagingVendorClient {
  readonly vendorName = 'healthlink';
  private readonly logger = new Logger(MockHealthLinkClient.name);
  private readonly failureRate: number;

  constructor(config: ConfigService) {
    this.failureRate = Number(config.get<string>('HEALTHLINK_MOCK_FAILURE_RATE', '0')) || 0;
  }

  async send(request: SecureMessageSendRequest): Promise<SecureMessageSendResult> {
    await new Promise((resolve) => setTimeout(resolve, 0));

    if (request.recipientEndpointId.toUpperCase().includes('FAIL') || Math.random() < this.failureRate) {
      this.logger.warn(`MOCK HealthLink delivery failed for referral ${request.referralId}`);
      throw new SecureMessagingVendorError(
        this.vendorName,
        `HealthLink rejected delivery to endpoint '${request.recipientEndpointId}' (MOCK failure)`,
      );
    }

    return { vendorMessageId: `HL-${randomUUID()}`, status: 'accepted' };
  }
}
