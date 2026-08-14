import type { APIRequestContext, BrowserContext } from '@playwright/test';
import { urls } from './env';

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  /** Epoch milliseconds — matches every app's own `TokenSet.obtainedAt` (see
   * apps/{gp-portal,specialist-portal,patient-web}'s oidc client files). */
  obtainedAt: number;
  expiresInSeconds: number;
}

/**
 * Fetches a real, Keycloak-signed access token via Resource Owner Password
 * Credentials (the "direct grant" flow) for one of the e2e test users
 * defined in infra/keycloak/realm-export.json.
 *
 * This deliberately bypasses each app's own hosted-login-page redirect —
 * see README.md, "Why ROPC and not the real login UI" for the full
 * rationale (short version: GP/specialist logins mandatorily require
 * WebAuthn/passkey in the real "clinician-browser" flow, which this pass
 * did not build a virtual-authenticator harness for). The token itself is
 * completely real: signed by this Keycloak instance, verified by every
 * backend service exactly the same way a browser-obtained token would be.
 */
export async function fetchToken(
  request: APIRequestContext,
  username: string,
  password: string,
  clientId: string,
): Promise<TokenSet> {
  const obtainedAt = Date.now();
  const res = await request.post(`${urls.keycloakIssuer}/protocol/openid-connect/token`, {
    form: {
      grant_type: 'password',
      client_id: clientId,
      username,
      password,
      scope: 'openid profile email',
    },
  });
  if (!res.ok()) {
    throw new Error(
      `Keycloak token request failed for ${username} (client ${clientId}): ${res.status()} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
  };
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    idToken: body.id_token,
    obtainedAt,
    expiresInSeconds: body.expires_in,
  };
}

/** Decodes a JWT payload without verifying the signature — fine for a test reading its own, already-trusted token. */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  return JSON.parse(json);
}

/**
 * Seeds a *dedicated* browser context (one per persona — see golden-path.spec.ts)
 * so that, on first navigation, its Next.js app finds a valid token already in
 * `sessionStorage` under the app's own storage key (see
 * apps/{gp-portal,specialist-portal,patient-web}'s oidc client
 * `TOKEN_STORAGE_KEY` constants) and treats the user as already
 * authenticated — the same effect `handleCallback()` has after a real
 * redirect-based login, just without driving that redirect.
 *
 * Uses `addInitScript` (not a post-navigation `page.evaluate`) so the value
 * is present before the app's own React code runs on mount — avoids a race
 * against `AuthContext`'s `loadFromStorage()` effect. One context per
 * persona keeps this simple (sessionStorage is origin-scoped, but each
 * persona also needs its own cookie jar/local-storage isolation regardless,
 * since three different logged-in principals are active across the suite).
 */
export async function seedAppSession(context: BrowserContext, storageKey: string, tokens: TokenSet): Promise<void> {
  await context.addInitScript(
    ({ key, value }) => {
      window.sessionStorage.setItem(key, value);
    },
    { key: storageKey, value: JSON.stringify(tokens) },
  );
}
