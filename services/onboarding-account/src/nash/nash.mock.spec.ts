import { MockNashCredentialClient } from './nash.mock';

describe('MockNashCredentialClient', () => {
  it('issues a credential id and marks it issued', async () => {
    const client = new MockNashCredentialClient();
    const result = await client.provision({ hpiI: '8003611234567890', organisationName: 'Riverside Specialists' });
    expect(result.status).toBe('issued');
    expect(result.nashCredentialId).toMatch(/^nash-mock-/);
    expect(new Date(result.issuedAt).toString()).not.toBe('Invalid Date');
  });

  it('issues a different credential id on each call', async () => {
    const client = new MockNashCredentialClient();
    const a = await client.provision({ hpiI: '1', organisationName: 'x' });
    const b = await client.provision({ hpiI: '1', organisationName: 'x' });
    expect(a.nashCredentialId).not.toBe(b.nashCredentialId);
  });
});
