/**
 * Helpers for talking to the real running stack.
 *
 * Every URL here is a **host-published** port, deliberately: these tests exercise the
 * same path a browser takes, which is precisely where the bugs this tier exists to
 * catch actually lived. Talking to services over the Docker network instead would have
 * hidden the issuer mismatch entirely — server-side tokens matched, browser ones did
 * not, and that difference is the whole bug.
 */

export const KEYCLOAK = 'http://localhost:20004';
export const REALM = 'referralplatform';
export const ISSUER = `${KEYCLOAK}/realms/${REALM}`;

export const SERVICE_URLS = {
  identityAccess: 'http://localhost:20007',
  onboardingAccount: 'http://localhost:20008',
  gpAuthorisation: 'http://localhost:20009',
  consentSecurity: 'http://localhost:20010',
  referral: 'http://localhost:20011',
  directory: 'http://localhost:20012',
  booking: 'http://localhost:20013',
  specialistReview: 'http://localhost:20014',
  followupRecall: 'http://localhost:20015',
  notification: 'http://localhost:20016',
  adminConsole: 'http://localhost:20017',
  auditLog: 'http://localhost:20018',
  fhirGateway: 'http://localhost:20019',
} as const;

/** Local-dev credentials — the same placeholders docker-compose.yml ships. */
export const ADMIN = { username: 'admin', password: 'change-me-in-local-env' };
export const CLIENT_SECRET = 'change-me-in-local-env';

async function form(url: string, body: Record<string, string>): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
}

/** Keycloak admin token, for realm assertions. */
export async function adminToken(): Promise<string> {
  const res = await form(`${KEYCLOAK}/realms/master/protocol/openid-connect/token`, {
    client_id: 'admin-cli',
    grant_type: 'password',
    ...ADMIN,
  });
  if (!res.ok) throw new Error(`Keycloak admin token failed: ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/**
 * A service-account token, minted over the **host-published** Keycloak port — i.e. the
 * same issuer a browser would get. That is the point: see the issuer test.
 */
export async function serviceToken(clientId: string): Promise<string> {
  const res = await form(`${ISSUER}/protocol/openid-connect/token`, {
    client_id: clientId,
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials',
  });
  if (!res.ok) throw new Error(`Token for ${clientId} failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export function decodeJwt(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

export async function adminApi<T = unknown>(path: string, token: string): Promise<T> {
  const res = await fetch(`${KEYCLOAK}/admin/realms/${REALM}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Admin API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Fails the suite loudly when the stack is not running.
 *
 * Deliberately NOT a silent skip: an integration tier that quietly passes when nothing
 * is running is worse than no tier at all, because it reports green while testing
 * nothing. If these tests cannot reach the stack, that is a failure to be fixed by
 * starting it, not a condition to tolerate.
 */
export async function requireStack(): Promise<void> {
  const res = await fetch(`${KEYCLOAK}/realms/${REALM}/.well-known/openid-configuration`).catch(
    () => null,
  );
  if (!res?.ok) {
    throw new Error(
      `The stack is not reachable at ${KEYCLOAK}. Integration tests run against the real ` +
        `containers — start them first:\n\n` +
        `  docker compose up -d postgres redis immudb keycloak mailhog audit-log identity-access referral\n`,
    );
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
