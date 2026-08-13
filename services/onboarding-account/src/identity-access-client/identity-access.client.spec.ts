import { ConfigService } from '@nestjs/config';
import { IdentityAccessClient } from './identity-access.client';

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    KEYCLOAK_ISSUER: 'http://keycloak:8080/realms/referralplatform',
    KEYCLOAK_CLIENT_ID: 'onboarding-account-service',
    KEYCLOAK_CLIENT_SECRET: 'secret',
    IDENTITY_ACCESS_SERVICE_URL: 'http://identity-access:3001',
    ...overrides,
  };
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const v = values[key];
      if (v === undefined) throw new Error(`missing ${key}`);
      return v;
    },
  } as unknown as ConfigService;
}

describe('IdentityAccessClient', () => {
  it('never throws when IDENTITY_ACCESS_SERVICE_URL is not configured', async () => {
    const client = new IdentityAccessClient(makeConfig({ IDENTITY_ACCESS_SERVICE_URL: '' }), jest.fn());
    const result = await client.promptPasskeyEnrolment({ keycloakUserId: 'u1', principalType: 'patient' });
    expect(result.prompted).toBe(false);
  });

  it('returns prompted:true on a successful call', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok', expires_in: 300 }) })
      .mockResolvedValueOnce({ ok: true });

    const client = new IdentityAccessClient(makeConfig(), fetchImpl as unknown as typeof fetch);
    const result = await client.promptPasskeyEnrolment({ keycloakUserId: 'u1', principalType: 'carer' });

    expect(result.prompted).toBe(true);
  });

  it('never throws — returns prompted:false when the service is unreachable (documented gap)', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok', expires_in: 300 }) })
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    const client = new IdentityAccessClient(makeConfig(), fetchImpl as unknown as typeof fetch);
    const result = await client.promptPasskeyEnrolment({ keycloakUserId: 'u1', principalType: 'patient' });

    expect(result.prompted).toBe(false);
    expect(result.reason).toContain('ECONNREFUSED');
  });
});
