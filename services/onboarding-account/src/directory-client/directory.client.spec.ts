import { ConfigService } from '@nestjs/config';
import { DirectoryClient } from './directory.client';

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    KEYCLOAK_ISSUER: 'http://keycloak:8080/realms/referralplatform',
    KEYCLOAK_CLIENT_ID: 'onboarding-account-service',
    KEYCLOAK_CLIENT_SECRET: 'secret',
    DIRECTORY_SERVICE_URL: 'http://directory:3006',
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

const input = {
  specialistId: 'spec_1',
  givenName: 'Alex',
  familyName: 'Smith',
  specialty: 'Cardiology',
  hpiI: '8003611234567890',
  contactEmail: 'alex@example.com',
};

describe('DirectoryClient', () => {
  it('returns created:false without throwing when DIRECTORY_SERVICE_URL is not configured', async () => {
    const client = new DirectoryClient(makeConfig({ DIRECTORY_SERVICE_URL: '' }), jest.fn());
    const result = await client.createProfile(input);
    expect(result.created).toBe(false);
  });

  it('returns created:true with the profile id on a successful call', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok', expires_in: 300 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'dir_123' }) });

    const client = new DirectoryClient(makeConfig(), fetchImpl as unknown as typeof fetch);
    const result = await client.createProfile(input);

    expect(result).toEqual({ created: true, directoryProfileId: 'dir_123' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('gracefully returns created:false when the Directory Service responds with an error status', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok', expires_in: 300 }) })
      .mockResolvedValueOnce({ ok: false, status: 404 });

    const client = new DirectoryClient(makeConfig(), fetchImpl as unknown as typeof fetch);
    const result = await client.createProfile(input);

    expect(result.created).toBe(false);
    expect(result.reason).toContain('404');
  });

  it('gracefully returns created:false (never throws) when the Directory Service is unreachable', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok', expires_in: 300 }) })
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    const client = new DirectoryClient(makeConfig(), fetchImpl as unknown as typeof fetch);
    const result = await client.createProfile(input);

    expect(result.created).toBe(false);
    expect(result.reason).toContain('ECONNREFUSED');
  });
});
