import { ServiceTokenProvider } from './service-token';

describe('ServiceTokenProvider', () => {
  it('fetches and caches a client-credentials token', async () => {
    const fetchImpl = jest.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ access_token: 'tok-1', expires_in: 300 }),
          text: async () => '',
        }) as unknown as Response,
    );

    const provider = new ServiceTokenProvider({
      issuer: 'http://keycloak:8080/realms/referralplatform',
      clientId: 'referral-service',
      clientSecret: 'secret',
      fetchImpl,
    });

    const first = await provider.getToken();
    const second = await provider.getToken();

    expect(first).toBe('tok-1');
    expect(second).toBe('tok-1');
    expect(fetchImpl).toHaveBeenCalledTimes(1); // second call served from cache
  });

  it('throws when Keycloak responds with an error', async () => {
    const fetchImpl = jest.fn(
      async () => ({ ok: false, status: 401, text: async () => 'invalid_client' }) as unknown as Response,
    );
    const provider = new ServiceTokenProvider({
      issuer: 'http://keycloak:8080/realms/referralplatform',
      clientId: 'bad',
      clientSecret: 'bad',
      fetchImpl,
    });
    await expect(provider.getToken()).rejects.toThrow(/Failed to obtain service token/);
  });
});
