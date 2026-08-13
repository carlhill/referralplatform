/**
 * PKCE (RFC 7636) helpers for the Authorization Code flow against Keycloak's
 * "specialist-portal" OIDC client — a public client with PKCE S256 enforced
 * (see infra/keycloak/realm-export.json: `publicClient: true`,
 * `directAccessGrantsEnabled: false`, `attributes.pkce.code.challenge.method:
 * "S256"`). There is no client secret to protect here — that's the whole
 * point of PKCE for a browser-based public client — so this file's only job
 * is to prove possession of the same code verifier across the
 * authorize-redirect and the token exchange.
 *
 * Runs entirely client-side (browser Web Crypto API). Never imported from a
 * server component.
 */

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof window === 'undefined' ? btoa(binary) : window.btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A cryptographically random, URL-safe string — used as both the PKCE code verifier and the OAuth `state`. */
export function generateRandomString(length = 64): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return base64UrlEncode(array).slice(0, length);
}

/** SHA-256(code_verifier), base64url-encoded — the S256 `code_challenge` sent on the authorize request. */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}
