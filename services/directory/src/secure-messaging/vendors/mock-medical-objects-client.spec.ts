import { MockMedicalObjectsClient } from './mock-medical-objects-client';
import { SecureMessagingVendorError } from './vendor-error';

class FakeConfigService {
  get<T>(_key: string, defaultValue?: T): T {
    return defaultValue as T;
  }
}

describe('MockMedicalObjectsClient', () => {
  it('succeeds and returns a vendorMessageId for a normal endpoint', async () => {
    const client = new MockMedicalObjectsClient(new FakeConfigService() as any);
    const result = await client.send({
      referralId: 'ref-1',
      recipientEndpointId: 'MO-MAILBOX-1',
      urgent: true,
      summary: 'Dermatology referral',
    });
    expect(result.status).toBe('accepted');
    expect(result.vendorMessageId).toMatch(/^MO-/);
  });

  it('deterministically fails when the endpoint id contains FAIL', async () => {
    const client = new MockMedicalObjectsClient(new FakeConfigService() as any);
    await expect(
      client.send({ referralId: 'ref-1', recipientEndpointId: 'mailbox-FAIL-1', urgent: false, summary: 'x' }),
    ).rejects.toThrow(SecureMessagingVendorError);
  });
});
