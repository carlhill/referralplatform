/**
 * Client-side JWT payload decoding — display/routing only, never an
 * authorization decision (every request that matters is re-verified
 * server-side by `packages/auth-client`'s `TokenVerifier` — root
 * CONVENTIONS.md §8). Mirrors apps/gp-portal/lib/auth/jwt.ts.
 */
export interface DecodedAccessToken {
  sub: string;
  principal_type?: 'patient' | 'carer' | 'gp' | 'specialist' | 'internal_staff' | 'system';
  healthcare_identifier?: string;
  preferred_username?: string;
  name?: string;
  email?: string;
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
  exp?: number;
  iat?: number;
  acr?: string;
  amr?: string[];
  [key: string]: unknown;
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Manual base64 -> byte-string decoder — deliberately not `atob`/`Buffer`.
 * Hermes (React Native's JS engine) does not reliably expose either as a
 * global across the SDK/architecture combinations this app might run under,
 * and this function needs to work identically here and under Jest (Node).
 * A small hand-rolled decoder sidesteps that entirely.
 */
function base64ToBinaryString(base64: string): string {
  const clean = base64.replace(/=+$/, '');
  let binary = '';
  let buffer = 0;
  let bitsCollected = 0;
  for (const char of clean) {
    const value = BASE64_CHARS.indexOf(char);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bitsCollected += 6;
    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      binary += String.fromCharCode((buffer >> bitsCollected) & 0xff);
    }
  }
  return binary;
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = base64ToBinaryString(padded);
  let percentEncoded = '';
  for (let i = 0; i < binary.length; i += 1) {
    percentEncoded += '%' + binary.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return decodeURIComponent(percentEncoded);
}

export function decodeJwt(token: string): DecodedAccessToken | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(base64UrlDecode(parts[1])) as DecodedAccessToken;
  } catch {
    return null;
  }
}

export function isExpired(decoded: DecodedAccessToken | null, skewSeconds = 30): boolean {
  if (!decoded?.exp) return true;
  return Date.now() / 1000 > decoded.exp - skewSeconds;
}

export function rolesOf(decoded: DecodedAccessToken | null): string[] {
  if (!decoded) return [];
  const realmRoles = decoded.realm_access?.roles ?? [];
  const clientRoles = Object.values(decoded.resource_access ?? {}).flatMap((r) => r.roles ?? []);
  return [...realmRoles, ...clientRoles];
}

/** True once the token carries a recent passkey/hardware-key re-authentication — mirrors each backend service's own step-up check (e.g. services/consent-security/src/common/step-up.ts), for UI gating only. */
export function hasStepUp(decoded: DecodedAccessToken | null): boolean {
  if (!decoded) return false;
  const amr = Array.isArray(decoded.amr) ? decoded.amr : [];
  return decoded.acr === 'passkey' || amr.includes('webauthn') || amr.includes('hwk') || amr.includes('swk');
}
