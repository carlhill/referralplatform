import { ConsentSecurityClient } from './consent-security.client';

function fakeConfig(values: Record<string, string>) {
  return {
    get: (key: string, fallback?: string) => values[key] ?? fallback,
    getOrThrow: (key: string) => {
      if (!(key in values)) throw new Error(`missing config ${key}`);
      return values[key];
    },
  };
}

describe('ConsentSecurityClient.isPatientDeceased', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function makeClient(): ConsentSecurityClient {
    const config = fakeConfig({
      CONSENT_SECURITY_SERVICE_URL: 'http://consent-security:3004',
      KEYCLOAK_ISSUER: 'http://keycloak/realms/referralplatform',
      KEYCLOAK_CLIENT_ID: 'followup-recall-service',
      KEYCLOAK_CLIENT_SECRET: 'secret',
    });
    const client = new ConsentSecurityClient(config as any);
    // Bypass the real ServiceTokenProvider (would try to hit Keycloak) — inject a stub token getter.
    (client as any).tokens = { getToken: async () => 'fake-token' };
    return client;
  }

  it('returns false for a 404 (no active deceased flag — the common case)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 404, ok: false }) as any;
    const client = makeClient();
    await expect(client.isPatientDeceased('patient-1')).resolves.toBe(false);
  });

  it('returns true for a 200 (an active deceased flag exists)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true }) as any;
    const client = makeClient();
    await expect(client.isPatientDeceased('patient-1')).resolves.toBe(true);
  });

  it('fails open (returns false) if the Consent & Security Service is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;
    const client = makeClient();
    await expect(client.isPatientDeceased('patient-1')).resolves.toBe(false);
  });
});
