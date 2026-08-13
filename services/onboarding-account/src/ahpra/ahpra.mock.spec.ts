import { MockAhpraVerificationClient } from './ahpra.mock';

describe('MockAhpraVerificationClient', () => {
  const client = new MockAhpraVerificationClient();

  it('rejects a malformed AHPRA number', async () => {
    const result = await client.verifyRegistration({ ahpraNumber: 'bad', familyName: 'Smith' });
    expect(result.verified).toBe(false);
  });

  it('rejects an unrecognised profession code', async () => {
    const result = await client.verifyRegistration({ ahpraNumber: 'ZZZ0001234567', familyName: 'Smith' });
    expect(result.verified).toBe(false);
  });

  it('verifies a well-formed, recognised AHPRA number deterministically', async () => {
    const input = { ahpraNumber: 'MED0001234567', familyName: 'Smith' };
    const first = await client.verifyRegistration(input);
    const second = await client.verifyRegistration({ ...input });
    expect(first.verified).toBe(true);
    expect(first.registrationStatus).toBe('Registered');
    expect(first.specialty).toBe(second.specialty);
  });

  it('treats the reserved all-zero numeric body as not currently registered (test fixture)', async () => {
    const result = await client.verifyRegistration({ ahpraNumber: 'MED0000000000', familyName: 'Smith' });
    expect(result.verified).toBe(false);
    expect(result.registrationStatus).toBe('Cancelled');
  });
});
