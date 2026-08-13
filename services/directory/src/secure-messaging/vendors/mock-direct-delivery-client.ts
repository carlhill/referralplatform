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
 * Represents delivering a referral directly into an onboarded specialist's
 * own platform inbox (Specialist Review Service) rather than via an
 * external secure messaging vendor — the "or directly if the specialist is
 * onboarded" half of the Secure Messaging Gateway's routing decision. In a
 * real build this is an internal service-to-service call to the Specialist
 * Review Service (out of this build's scope — see
 * services/specialist-review), not a "vendor" in the external-integration
 * sense, but it implements the same `SecureMessagingVendorClient` interface
 * so `SecureMessagingService`'s routing logic doesn't need a third code
 * path for it.
 */
@Injectable()
export class MockDirectDeliveryClient implements SecureMessagingVendorClient {
  readonly vendorName = 'direct_platform';
  private readonly logger = new Logger(MockDirectDeliveryClient.name);
  private readonly failureRate: number;

  constructor(config: ConfigService) {
    this.failureRate = Number(config.get<string>('DIRECT_DELIVERY_MOCK_FAILURE_RATE', '0')) || 0;
  }

  async send(request: SecureMessageSendRequest): Promise<SecureMessageSendResult> {
    await new Promise((resolve) => setTimeout(resolve, 0));

    if (request.recipientEndpointId.toUpperCase().includes('FAIL') || Math.random() < this.failureRate) {
      this.logger.warn(`MOCK direct platform delivery failed for referral ${request.referralId}`);
      throw new SecureMessagingVendorError(
        this.vendorName,
        `Direct platform delivery to endpoint '${request.recipientEndpointId}' failed (MOCK failure — e.g. specialist inbox unreachable)`,
      );
    }

    return { vendorMessageId: `DIRECT-${randomUUID()}`, status: 'accepted' };
  }
}
