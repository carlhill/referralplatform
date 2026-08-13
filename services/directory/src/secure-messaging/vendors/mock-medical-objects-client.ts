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
 * Medical-Objects is the other major Australian secure clinical messaging
 * vendor (alongside HealthLink) — see mock-healthlink-client.ts for the
 * same "why mocked" explanation; this is the second vendor
 * modules-and-requirements.md asks for a clean interface to add.
 */
@Injectable()
export class MockMedicalObjectsClient implements SecureMessagingVendorClient {
  readonly vendorName = 'medical_objects';
  private readonly logger = new Logger(MockMedicalObjectsClient.name);
  private readonly failureRate: number;

  constructor(config: ConfigService) {
    this.failureRate = Number(config.get<string>('MEDICAL_OBJECTS_MOCK_FAILURE_RATE', '0')) || 0;
  }

  async send(request: SecureMessageSendRequest): Promise<SecureMessageSendResult> {
    await new Promise((resolve) => setTimeout(resolve, 0));

    if (request.recipientEndpointId.toUpperCase().includes('FAIL') || Math.random() < this.failureRate) {
      this.logger.warn(`MOCK Medical-Objects delivery failed for referral ${request.referralId}`);
      throw new SecureMessagingVendorError(
        this.vendorName,
        `Medical-Objects rejected delivery to endpoint '${request.recipientEndpointId}' (MOCK failure)`,
      );
    }

    return { vendorMessageId: `MO-${randomUUID()}`, status: 'accepted' };
  }
}
