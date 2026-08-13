import { config } from '../api/config';

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  obtainedAt: number;
  expiresInSeconds: number;
}

export function tokenEndpoint(): string {
  return `${config.keycloakIssuer}/protocol/openid-connect/token`;
}

export function authorizationEndpoint(): string {
  return `${config.keycloakIssuer}/protocol/openid-connect/auth`;
}

export function endSessionEndpoint(): string {
  return `${config.keycloakIssuer}/protocol/openid-connect/logout`;
}

export function isTokenSetExpired(tokens: TokenSet, skewSeconds = 30): boolean {
  const expiresAt = tokens.obtainedAt + tokens.expiresInSeconds * 1000;
  return Date.now() > expiresAt - skewSeconds * 1000;
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Pure-JS byte-string -> base64url encoder — see jwt.ts's decoder for why this avoids `btoa`/`Buffer`. */
function base64UrlEncodeBinaryString(binary: string): string {
  let out = '';
  let i = 0;
  for (; i + 3 <= binary.length; i += 3) {
    const n = (binary.charCodeAt(i) << 16) | (binary.charCodeAt(i + 1) << 8) | binary.charCodeAt(i + 2);
    out +=
      BASE64_CHARS[(n >> 18) & 63] + BASE64_CHARS[(n >> 12) & 63] + BASE64_CHARS[(n >> 6) & 63] + BASE64_CHARS[n & 63];
  }
  const remaining = binary.length - i;
  if (remaining === 1) {
    const n = binary.charCodeAt(i) << 16;
    out += BASE64_CHARS[(n >> 18) & 63] + BASE64_CHARS[(n >> 12) & 63];
  } else if (remaining === 2) {
    const n = (binary.charCodeAt(i) << 16) | (binary.charCodeAt(i + 1) << 8);
    out += BASE64_CHARS[(n >> 18) & 63] + BASE64_CHARS[(n >> 12) & 63] + BASE64_CHARS[(n >> 6) & 63];
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_');
}

/** UTF-8 encodes `text` into a byte-string via `encodeURIComponent`'s percent-escapes (handles non-ASCII given names correctly). */
function utf8ToBinaryString(text: string): string {
  const percentEncoded = encodeURIComponent(text);
  let out = '';
  for (let i = 0; i < percentEncoded.length; i += 1) {
    if (percentEncoded[i] === '%') {
      out += String.fromCharCode(parseInt(percentEncoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out += percentEncoded[i];
    }
  }
  return out;
}

function base64UrlEncodeJson(obj: unknown): string {
  return base64UrlEncodeBinaryString(utf8ToBinaryString(JSON.stringify(obj)));
}

/**
 * A locally-synthesised, unsigned "token set" — the same documented,
 * dev-only bridge apps/patient-web/lib/auth/oidc-client.ts uses (see that
 * file's `buildLocalActivationSession` doc comment for the full rationale
 * and the cross-service Keycloak-provisioning gap this works around).
 * NOT a real Keycloak session; never accepted by any backend's real
 * `TokenVerifier`. Documented in BUILD_LOG/patient-app.md.
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
