/**
 * PKCE (RFC 7636) helpers for the Authorization Code + PKCE flow against
 * Keycloak — `patient-web` is a PUBLIC client (`publicClient: true`, no
 * client secret) per `infra/keycloak/realm-export.json`, bound to the
 * `patient-carer-browser` auth flow (passkey offered as an ALTERNATIVE to
 * password+conditional-OTP — encouraged, not mandatory, per
 * identity-security-recommendations.md §6). Web Crypto API only.
 */

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(digest);
}

export function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}
