import { MockDirectDeliveryClient } from './mock-direct-delivery-client';
import { SecureMessagingVendorError } from './vendor-error';

class FakeConfigService {
  get<T>(_key: string, defaultValue?: T): T {
    return defaultValue as T;
  }
}

describe('MockDirectDeliveryClient', () => {
  it('succeeds and returns a vendorMessageId for a normal endpoint', async () => {
    const client = new MockDirectDeliveryClient(new FakeConfigService() as any);
    const result = await client.send({
      referralId: 'ref-1',
      recipientEndpointId: 'specialist-inbox-1',
      urgent: false,
      summary: 'Psychiatry referral',
    });
    expect(result.status).toBe('accepted');
    expect(result.vendorMessageId).toMatch(/^DIRECT-/);
  });

  it('deterministically fails when the endpoint id contains FAIL', async () => {
    const client = new MockDirectDeliveryClient(new FakeConfigService() as any);
    await expect(
      client.send({ referralId: 'ref-1', recipientEndpointId: 'inbox-FAIL', urgent: false, summary: 'x' }),
    ).rejects.toThrow(SecureMessagingVendorError);
  });
});
