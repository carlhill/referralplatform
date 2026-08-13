import { MockSmsProvider } from './sms-provider';

describe('MockSmsProvider', () => {
  it('returns a synthetic provider message id for every send', async () => {
    const provider = new MockSmsProvider();
    const result = await provider.send({ to: '+61412345678', message: 'Your code is 1234' });
    expect(result.providerMessageId).toMatch(/^mock-sms-/);
  });
});
