/**
 * Client-side JWT payload decoding — for display/routing decisions only
 * (which principal is signed in, their role, whether the access token has
 * expired). This is NOT verification: the browser has no business verifying
 * a signature it can't keep secret material for, and every request that
 * matters is re-verified server-side by the target service's
 * `packages/auth-client` `TokenVerifier` (see root CONVENTIONS.md §8). Never
 * use anything decoded here as an authorization decision on its own.
 */
export interface DecodedAccessToken {
  sub: string;
  /** Custom claim set by the Identity & Access Service's token mapper — see packages/auth-client's TokenVerifier. */
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
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  if (typeof atob === 'function') {
    const binary = atob(padded);
    // Decode UTF-8 bytes correctly (JWT payloads may contain non-ASCII display names) without
    // depending on `TextDecoder`, which some test environments (and older browsers) don't provide.
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
