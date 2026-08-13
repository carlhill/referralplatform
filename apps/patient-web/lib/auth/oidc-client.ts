import { config } from '../api/config';
import { generateCodeChallenge, generateCodeVerifier, generateState } from './pkce';

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  obtainedAt: number;
  expiresInSeconds: number;
}

const PKCE_STORAGE_KEY = 'rp_patient_web_pkce';
const TOKEN_STORAGE_KEY = 'rp_patient_web_tokens';
const POST_LOGIN_REDIRECT_KEY = 'rp_patient_web_post_login_redirect';

function redirectUri(): string {
  return `${config.appBaseUrl}/callback`;
}

function tokenEndpoint(): string {
  return `${config.keycloakIssuer}/protocol/openid-connect/token`;
}

function authorizeEndpoint(): string {
  return `${config.keycloakIssuer}/protocol/openid-connect/auth`;
}

export function endSessionEndpoint(): string {
  return `${config.keycloakIssuer}/protocol/openid-connect/logout`;
}

/**
 * Kicks off the Authorization Code + PKCE redirect to Keycloak's hosted
 * login, bound to the `patient-carer-browser` flow (passkey ALTERNATIVE to
 * password+conditional-OTP — see infra/keycloak/README.md).
 *
 * KNOWN GAP (see BUILD_LOG/patient-app.md): no Keycloak user is provisioned
 * for a patient/carer anywhere in this build yet (onboarding-account's own
 * BUILD_LOG documents the same gap on its side) — this flow is real,
 * verified-shape PKCE code, but there is not yet a user account on the
 * other end of it until that provisioning step is wired up (most likely
 * inside services/onboarding-account's `verifyOtp`, calling
 * services/identity-access's keycloak-admin client). Until then, local/dev
 * use of this app should go through the onboarding activation flow, whose
 * successful completion is used as a lightweight local session (see
 * AuthContext.tsx's `completeActivationSession`) so the rest of the app is
 * exercisable end-to-end without a live Keycloak realm import.
 */
export async function startLogin(postLoginPath = '/'): Promise<void> {
  const codeVerifier = generateCodeVerifier();
  const state = generateState();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  sessionStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify({ codeVerifier, state }));
  sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, postLoginPath);

  const params = new URLSearchParams({
    client_id: config.keycloakClientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid profile email',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  window.location.assign(`${authorizeEndpoint()}?${params.toString()}`);
}

export interface CallbackResult {
  tokens: TokenSet;
  postLoginPath: string;
}

export async function handleCallback(searchParams: URLSearchParams): Promise<CallbackResult> {
  const error = searchParams.get('error');
  if (error) {
    throw new Error(searchParams.get('error_description') ?? `Keycloak returned an error: ${error}`);
  }

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const stored = sessionStorage.getItem(PKCE_STORAGE_KEY);
  if (!code || !state || !stored) {
    throw new Error('Missing authorization code, state, or PKCE verifier — start sign-in again.');
  }
  const { codeVerifier, state: expectedState } = JSON.parse(stored) as { codeVerifier: string; state: string };
  if (state !== expectedState) {
    throw new Error('Sign-in state mismatch — possible CSRF, or the link was opened in another tab. Try again.');
  }
  sessionStorage.removeItem(PKCE_STORAGE_KEY);

  const tokens = await exchangeCode(code, codeVerifier);
  storeTokens(tokens);

  const postLoginPath = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY) ?? '/';
  sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
  return { tokens, postLoginPath };
}

async function exchangeCode(code: string, codeVerifier: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.keycloakClientId,
    redirect_uri: redirectUri(),
    code,
    code_verifier: codeVerifier,
  });
  return await postTokenRequest(body);
}

export async function refreshTokens(refreshToken: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.keycloakClientId,
    refresh_token: refreshToken,
  });
  return await postTokenRequest(body);
}

async function postTokenRequest(body: URLSearchParams): Promise<TokenSet> {
  const res = await fetch(tokenEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Keycloak token request failed (${res.status}): ${text || res.statusText}`);
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
    obtainedAt: Date.now(),
    expiresInSeconds: json.expires_in,
  };
}

export function storeTokens(tokens: TokenSet): void {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

export function loadStoredTokens(): TokenSet | null {
  const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenSet;
  } catch {
    return null;
  }
}

export function clearStoredTokens(): void {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function isTokenSetExpired(tokens: TokenSet, skewSeconds = 30): boolean {
  const expiresAt = tokens.obtainedAt + tokens.expiresInSeconds * 1000;
  return Date.now() > expiresAt - skewSeconds * 1000;
}

/**
 * A locally-synthesised, unsigned "token set" issued by this app itself the
 * moment `POST /account-activation/:token/otp/verify` returns `activated`.
 * NOT a real Keycloak session (no signature, never accepted by any backend
 * `TokenVerifier` — see root CONVENTIONS.md §8) — it exists purely so the
 * rest of this skeleton's screens (dashboard, referrals, consent page) are
 * click-through-able in local dev against services whose own bearer-auth
 * guards are themselves running with a permissive/dev token verifier
 * config, exactly mirroring the gap already documented in
 * services/onboarding-account/src/onboarding/onboarding.controller.ts's own
 * doc comment. Clearly namespaced and separately documented in
 * BUILD_LOG/patient-app.md so nobody mistakes this for real auth.
 */
export function buildLocalActivationSession(patientId: string, role: 'patient' | 'carer'): TokenSet {
  const header = base64UrlEncodeJson({ alg: 'none', typ: 'JWT' });
  const payload = base64UrlEncodeJson({
    sub: patientId,
    principal_type: role,
    preferred_username: role === 'patient' ? 'You' : 'Carer',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
  });
  return {
    accessToken: `${header}.${payload}.LOCALDEV`,
    obtainedAt: Date.now(),
    expiresInSeconds: 60 * 60 * 8,
  };
}

function base64UrlEncodeJson(obj: unknown): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
