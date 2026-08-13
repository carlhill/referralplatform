import { config } from './config';
import { apiFetch } from './http';
import type { Passkey } from './types';

const base = () => config.identityAccessUrl;

export function listPasskeys(token: string): Promise<Passkey[]> {
  return apiFetch(base(), '/passkeys', { token });
}

/** Requires a recent passkey/hardware-key step-up re-authentication server-side. */
export function revokePasskey(token: string, credentialId: string): Promise<{ revoked: true }> {
  return apiFetch(base(), `/passkeys/${encodeURIComponent(credentialId)}`, { method: 'DELETE', token });
}

export function requirePasskeyReenrolment(token: string): Promise<{ required: true }> {
  return apiFetch(base(), '/passkeys/require-reenrolment', { method: 'POST', token });
}
