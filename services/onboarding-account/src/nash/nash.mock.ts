import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { NashCredentialClient, ProvisionNashCredentialInput, ProvisionNashCredentialResult } from './nash.interface';

/**
 * MOCK — replace with real integration.
 *
 * Stands in for real NASH (National Authentication Service for Health)
 * credential issuance — a PKI certificate-issuance process operated by
 * Services Australia that requires an organisation's own registration and
 * RA (Registration Authority) verification steps entirely outside this
 * platform. There is no sandbox/test NASH environment this build has
 * credentials for, so this mock simply issues a random credential id and
 * marks it "issued" — a real integration would call out to an actual PKI
 * issuance API and store the resulting certificate/key material in a
 * hardware security module or equivalent secure store, never in this
 * service's own Postgres schema as this mock effectively does today (only
 * the credential id, never key material, is persisted — see
 * prisma/schema.prisma Specialist.nashCredentialId).
 */
@Injectable()
export class MockNashCredentialClient extends NashCredentialClient {
  private readonly logger = new Logger(MockNashCredentialClient.name);

  async provision(input: ProvisionNashCredentialInput): Promise<ProvisionNashCredentialResult> {
    const nashCredentialId = `nash-mock-${randomUUID()}`;
    this.logger.debug(`[MOCK NASH] issued ${nashCredentialId} for HPI-I ${input.hpiI} (${input.organisationName})`);
    return { nashCredentialId, status: 'issued', issuedAt: new Date().toISOString() };
  }
}
