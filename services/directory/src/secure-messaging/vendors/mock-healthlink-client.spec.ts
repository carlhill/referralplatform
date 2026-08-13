import { MockHealthLinkClient } from './mock-healthlink-client';
import { SecureMessagingVendorError } from './vendor-error';

class FakeConfigService {
  constructor(private readonly values: Record<string, string> = {}) {}
  get<T>(key: string, defaultValue?: T): T {
    return (this.values[key] as unknown as T) ?? (defaultValue as T);
  }
}

describe('MockHealthLinkClient', () => {
  it('succeeds and returns a vendorMessageId for a normal endpoint', async () => {
    const client = new MockHealthLinkClient(new FakeConfigService() as any);
    const result = await client.send({
      referralId: 'ref-1',
      recipientEndpointId: 'HL-MAILBOX-1',
      urgent: false,
      summary: 'Cardiology referral',
    });
    expect(result.status).toBe('accepted');
    expect(result.vendorMessageId).toMatch(/^HL-/);
  });

  it('deterministically fails (raises SecureMessagingVendorError, not a silent failure) when the endpoint id contains FAIL', async () => {
    const client = new MockHealthLinkClient(new FakeConfigService() as any);
    await expect(
      client.send({ referralId: 'ref-1', recipientEndpointId: 'FAIL-MAILBOX', urgent: false, summary: 'x' }),
    ).rejects.toThrow(SecureMessagingVendorError);
  });

  it('always fails when the configured mock failure rate is 1', async () => {
    const client = new MockHealthLinkClient(new FakeConfigService({ HEALTHLINK_MOCK_FAILURE_RATE: '1' }) as any);
    await expect(
      client.send({ referralId: 'ref-1', recipientEndpointId: 'OK-MAILBOX', urgent: false, summary: 'x' }),
    ).rejects.toThrow(SecureMessagingVendorError);
  });
});
