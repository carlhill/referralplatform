import { generateCodeChallenge, generateRandomString } from './pkce';

/**
 * OIDC Authorization Code + PKCE flow against Keycloak, for the
 * "specialist-portal" public client — see infra/keycloak/realm-export.json
 * and root CONVENTIONS.md §8 ("Assurance levels are not enforced by
 * [packages/auth-client] — it only verifies whatever token Keycloak
 * issued... passkey/hardware-key is mandatory for GP/specialist roles").
 * This module is the browser-side half of that: it gets a real token from
 * Keycloak using the standard flow (no client secret — this is a public
 * client), and every backend service call in this app sends that token as
 * `Authorization: Bearer <token>` for `packages/auth-client`'s
 * `TokenVerifier` to check on the way in.
 */

export interface OidcConfig {
  issuer: string;
  clientId: string;
  redirectUri: string;
}

export function getOidcConfig(): OidcConfig {
  const issuer = process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER ?? 'http://localhost:8180/realms/referralplatform';
  const clientId = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'specialist-portal';
  const redirectUri =
    typeof window !== 'undefined' ? `${window.location.origin}/callback` : 'http://localhost:3101/callback';
  return { issuer, clientId, redirectUri };
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

const TOKEN_STORAGE_KEY = 'rp_specialist_portal_tokens';
const PKCE_STORAGE_KEY = 'rp_specialist_portal_pkce_verifier';
const STATE_STORAGE_KEY = 'rp_specialist_portal_oauth_state';

/** Kicks off the redirect to Keycloak's authorize endpoint. Call from a click handler (needs `window`). */
export async function startLogin(): Promise<void> {
  const config = getOidcConfig();
  const verifier = generateRandomString(64);
  const state = generateRandomString(32);
  const challenge = await generateCodeChallenge(verifier);

  window.sessionStorage.setItem(PKCE_STORAGE_KEY, verifier);
  window.sessionStorage.setItem(STATE_STORAGE_KEY, state);

  const url = new URL(`${config.issuer}/protocol/openid-connect/auth`);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  window.location.assign(url.toString());
}

export class OidcError extends Error {}

/** Completes the flow on the `/callback` page: exchanges the authorization code for tokens. */
export async function completeLogin(code: string, state: string): Promise<TokenSet> {
  const expectedState = window.sessionStorage.getItem(STATE_STORAGE_KEY);
  const verifier = window.sessionStorage.getItem(PKCE_STORAGE_KEY);
  window.sessionStorage.removeItem(STATE_STORAGE_KEY);
  window.sessionStorage.removeItem(PKCE_STORAGE_KEY);

  if (!verifier || !expectedState || state !== expectedState) {
    throw new OidcError(
      'Login could not be verified (missing or mismatched state/PKCE verifier) — please sign in again.',
    );
  }

  const config = getOidcConfig();
  const tokens = await exchangeToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    code_verifier: verifier,
  });
  saveTokens(tokens);
  return tokens;
}

async function exchangeToken(body: Record<string, string>): Promise<TokenSet> {
  const config = getOidcConfig();
  const res = await fetch(`${config.issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new OidcError(`Keycloak token endpoint rejected the request (${res.status}): ${text}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    idToken: json.id_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}

/** Refreshes an expiring access token using the stored refresh token. Returns null if there's nothing to refresh with. */
export async function refreshTokens(current: TokenSet): Promise<TokenSet | null> {
  if (!current.refreshToken) return null;
  const config = getOidcConfig();
  try {
    const tokens = await exchangeToken({
      grant_type: 'refresh_token',
      refresh_token: current.refreshToken,
      client_id: config.clientId,
    });
    saveTokens(tokens);
    return tokens;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: TokenSet): void {
  window.sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

export function loadTokens(): TokenSet | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenSet;
  } catch {
    return null;
  }
}

export function clearTokens(): void {
  window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}

export interface DecodedPrincipal {
  sub: string;
  principalType: 'patient' | 'carer' | 'gp' | 'specialist' | 'internal_staff' | 'system';
  roles: string[];
  healthcareIdentifier?: string;
  preferredUsername?: string;
}

/**
 * Client-side JWT payload decode for display purposes only (whose name to
 * show, which nav items to render). This is NOT token verification — every
 * backend service independently verifies the token's signature via
 * `packages/auth-client`'s `TokenVerifier` on every request, per root
 * CONVENTIONS.md §8. Trusting an unverified decode client-side to gate a
 * network call is fine (the call fails server-side if the token's bad);
 * trusting it to gate a *write* without the server also checking would not
 * be — no such shortcut is taken anywhere in this app.
 */
export function decodeJwtPayload(token: string): DecodedPrincipal | null {
  try {
    const [, payloadB64] = token.split('.');
    if (!payloadB64) return null;
    const normalized = payloadB64
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payloadB64.length / 4) * 4, '=');
    const json = typeof window === 'undefined' ? atob(normalized) : window.atob(normalized);
    const payload = JSON.parse(json) as Record<string, unknown>;
    const realmRoles = ((payload.realm_access as { roles?: string[] } | undefined)?.roles ?? []) as string[];
    const resourceAccess = (payload.resource_access ?? {}) as Record<string, { roles?: string[] }>;
    const clientRoles = Object.values(resourceAccess).flatMap((r) => r.roles ?? []);
    return {
      sub: String(payload.sub ?? ''),
      principalType: (payload.principal_type as DecodedPrincipal['principalType']) ?? 'specialist',
      roles: [...realmRoles, ...clientRoles],
      healthcareIdentifier: payload.healthcare_identifier as string | undefined,
      preferredUsername: payload.preferred_username as string | undefined,
    };
  } catch {
    return null;
  }
}
