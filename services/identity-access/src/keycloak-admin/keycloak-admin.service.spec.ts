import { ConfigService } from '@nestjs/config';
import { KeycloakAdminService } from './keycloak-admin.service';

function makeConfig(): ConfigService {
  return {
    getOrThrow: (key: string) => {
      const values: Record<string, string> = {
        KEYCLOAK_ISSUER: 'http://keycloak:8080/realms/referralplatform',
        KEYCLOAK_CLIENT_ID: 'identity-access-service',
        KEYCLOAK_CLIENT_SECRET: 'change-me-in-local-env',
      };
      return values[key];
    },
  } as unknown as ConfigService;
}

/**
 * Every KeycloakAdminService call first fetches a client-credentials token
 * from Keycloak's token endpoint, then makes the actual Admin REST API call —
 * this stub fetch answers the token request generically and defers everything
 * else to `adminResponse`, mirroring what a real Keycloak would do.
 */
function fetchMockingTokenAnd(adminResponse: { status: number; body: unknown }): jest.Mock {
  return jest.fn(async (url: string) => {
    if (typeof url === 'string' && url.includes('/protocol/openid-connect/token')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'svc-token', expires_in: 300 }),
        text: async () => JSON.stringify({ access_token: 'svc-token', expires_in: 300 }),
      } as unknown as Response;
    }
    return {
      ok: adminResponse.status >= 200 && adminResponse.status < 300,
      status: adminResponse.status,
      text: async () => (adminResponse.body === undefined ? '' : JSON.stringify(adminResponse.body)),
    } as unknown as Response;
  });
}

/** Returns the [url, init] args of the call that hit the Admin REST API (i.e. not the token endpoint). */
function adminCallOf(fetchImpl: jest.Mock): [string, RequestInit] {
  const call = fetchImpl.mock.calls.find(([url]) => !String(url).includes('/protocol/openid-connect/token'));
  if (!call) {
    throw new Error('No Admin REST API call was made');
  }
  return call as [string, RequestInit];
}

describe('KeycloakAdminService', () => {
  it('derives the Admin REST base URL from the OIDC issuer and lists credentials', async () => {
    const fetchImpl = fetchMockingTokenAnd({ status: 200, body: [{ id: 'cred-1', type: 'webauthn-passwordless' }] });
    const service = new KeycloakAdminService(makeConfig(), fetchImpl as unknown as typeof fetch);

    const result = await service.listCredentials('user-123');

    expect(result).toEqual([{ id: 'cred-1', type: 'webauthn-passwordless' }]);
    const [url, init] = adminCallOf(fetchImpl);
    expect(url).toBe('http://keycloak:8080/admin/realms/referralplatform/users/user-123/credentials');
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer svc-token' });
  });

  it('deletes a credential by id, scoped to the given userId', async () => {
    const fetchImpl = fetchMockingTokenAnd({ status: 204, body: undefined });
    const service = new KeycloakAdminService(makeConfig(), fetchImpl as unknown as typeof fetch);

    await service.deleteCredential('user-123', 'cred-1');

    const [url, init] = adminCallOf(fetchImpl);
    expect(url).toBe('http://keycloak:8080/admin/realms/referralplatform/users/user-123/credentials/cred-1');
    expect(init.method).toBe('DELETE');
  });

  it("merges a required action into a user's existing required actions", async () => {
    // Calls in order: (1) token endpoint, (2) GET user, (3) PUT user.
    const fetchImpl = jest
      .fn()
      .mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'svc-token', expires_in: 300 }),
        text: async () => JSON.stringify({ access_token: 'svc-token', expires_in: 300 }),
      }))
      .mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ requiredActions: ['UPDATE_PASSWORD'] }),
      }))
      .mockImplementationOnce(async () => ({ ok: true, status: 204, text: async () => '' }));
    const service = new KeycloakAdminService(makeConfig(), fetchImpl as unknown as typeof fetch);

    await service.addRequiredAction('user-123', 'webauthn-register-passwordless');

    const putCall = fetchImpl.mock.calls[2];
    const putBody = JSON.parse((putCall[1] as RequestInit).body as string);
    expect(putBody.requiredActions.sort()).toEqual(['UPDATE_PASSWORD', 'webauthn-register-passwordless'].sort());
  });

  it('lists and removes federated identities', async () => {
    const listFetch = fetchMockingTokenAnd({
      status: 200,
      body: [{ identityProvider: 'google', userId: 'g-1', userName: 'a@b.com' }],
    });
    const listService = new KeycloakAdminService(makeConfig(), listFetch as unknown as typeof fetch);
    await expect(listService.listFederatedIdentities('user-123')).resolves.toHaveLength(1);

    const removeFetch = fetchMockingTokenAnd({ status: 204, body: undefined });
    const removeService = new KeycloakAdminService(makeConfig(), removeFetch as unknown as typeof fetch);
    await removeService.removeFederatedIdentity('user-123', 'google');
    const [url, init] = adminCallOf(removeFetch);
    expect(url).toBe('http://keycloak:8080/admin/realms/referralplatform/users/user-123/federated-identity/google');
    expect(init.method).toBe('DELETE');
  });

  it('throws when Keycloak returns a non-2xx response', async () => {
    const fetchImpl = fetchMockingTokenAnd({ status: 403, body: { error: 'forbidden' } });
    const service = new KeycloakAdminService(makeConfig(), fetchImpl as unknown as typeof fetch);

    await expect(service.listCredentials('user-123')).rejects.toThrow(/Keycloak Admin API/);
  });
});
