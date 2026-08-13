import { MockPushProvider } from './push-provider';

describe('MockPushProvider', () => {
  it('returns a synthetic provider message id for every send', async () => {
    const provider = new MockPushProvider();
    const result = await provider.send({ token: 'device-token-abc123', title: 'Hi', body: 'There' });
    expect(result.providerMessageId).toMatch(/^mock-push-/);
  });

  it('produces a distinct id per call', async () => {
    const provider = new MockPushProvider();
    const a = await provider.send({ token: 't1', title: 'A', body: 'a' });
    const b = await provider.send({ token: 't2', title: 'B', body: 'b' });
    expect(a.providerMessageId).not.toBe(b.providerMessageId);
  });
});
