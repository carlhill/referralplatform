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

function base64UrlDecode(input: string): string {
  const padded = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(input.length / 4) * 4, '=');
  if (typeof atob === 'function') {
    const binary = atob(padded);
    let percentEncoded = '';
    for (let i = 0; i < binary.length; i += 1) {
      percentEncoded += '%' + binary.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return decodeURIComponent(percentEncoded);
  }
  return Buffer.from(padded, 'base64').toString('utf-8');
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
