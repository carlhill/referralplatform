import { execSync } from 'node:child_process';
import { adminApi, adminToken, requireStack } from '../src/stack';

/**
 * REGRESSIONS covered here:
 *
 *  - **Healthchecks probed the wrong address.** All 13 services sat `unhealthy` while
 *    serving traffic normally, because each `HEALTHCHECK` used `localhost`, which
 *    resolves to ::1 inside these containers while the Node servers listen IPv4-only.
 *    Not cosmetic: `depends_on: condition: service_healthy` would never be satisfied.
 *  - **Clinician login was structurally impossible.** The credential sub-flow offered
 *    only WebAuthn, which Keycloak will not present to a user with no passkey, so a
 *    new GP could never sign in.
 *  - **SSO cookie and the myID redirector were silently ignored**, because `Forms` was
 *    REQUIRED beside ALTERNATIVE siblings.
 *  - **Client redirect URIs kept the pre-remap ports**, breaking sign-in.
 */
describe('Running stack: container health', () => {
  beforeAll(requireStack);

  it('reports every running platform container as healthy', () => {
    const out = execSync(
      'docker ps --filter "name=referralplatform" --format "{{.Names}}|{{.Status}}"',
      { encoding: 'utf8' },
    ).trim();

    const unhealthy = out
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('|'))
      .filter(([, status]) => status.includes('unhealthy'));

    expect(unhealthy.map(([name]) => name)).toEqual([]);
  });
});

describe('Keycloak realm shape', () => {
  let token: string;
  beforeAll(async () => {
    await requireStack();
    token = await adminToken();
  });

  it('lets a clinician with no passkey still reach a usable credential step', async () => {
    const execs = await adminApi<Array<Record<string, any>>>(
      '/authentication/flows/clinician-browser/executions',
      token,
    );
    const providers = execs.map((e) => e.providerId).filter(Boolean);

    // Both branches must exist: WebAuthn for enrolled clinicians, and a password
    // bootstrap for one who has never enrolled. With only WebAuthn present, Keycloak
    // has nothing to offer a new user and the login dead-ends.
    expect(providers).toEqual(expect.arrayContaining(['webauthn-authenticator-passwordless', 'auth-password-form']));
  });

  it('keeps Cookie as an ALTERNATIVE sibling so SSO re-authentication works', async () => {
    const execs = await adminApi<Array<Record<string, any>>>(
      '/authentication/flows/clinician-browser/executions',
      token,
    );
    const cookie = execs.find((e) => e.providerId === 'auth-cookie');
    const forms = execs.find((e) => e.displayName === 'clinician-browser Forms');

    // A REQUIRED sibling makes Keycloak ignore the ALTERNATIVE ones entirely.
    expect(cookie?.requirement).toBe('ALTERNATIVE');
    expect(forms?.requirement).toBe('ALTERNATIVE');
  });

  it('points the frontend clients at their current, remapped ports', async () => {
    for (const [clientId, port] of Object.entries({
      'gp-portal': 20020,
      'specialist-portal': 20021,
      'patient-web': 20022,
    })) {
      const [client] = await adminApi<Array<Record<string, any>>>(`/clients?clientId=${clientId}`, token);
      expect(client.redirectUris).toEqual([`http://localhost:${port}/*`]);
    }
  });

  it('declares principal_type, which authorisation depends on', async () => {
    const profile = await adminApi<{ attributes: Array<{ name: string }> }>('/users/profile', token);
    // Keycloak's declarative User Profile silently strips attributes it does not
    // declare, so without this a user created via the Admin API loses principal_type
    // and every role check falls back to 'system'.
    expect(profile.attributes.map((a) => a.name)).toContain('principal_type');
  });

  it('has SMTP configured, without which passkey enrolment emails go nowhere', async () => {
    const realm = await adminApi<{ smtpServer: Record<string, string> }>('', token);
    expect(realm.smtpServer?.host).toBeTruthy();
  });
});
