import { config } from './config';
import { apiFetch } from './http';
import type { GpLink, GpLinkStatus } from './types';

/** The new-GP push-approval API — module 1B of business-process-flow.md. */
export function listGpLinks(token: string, filter: { patientId?: string; status?: GpLinkStatus }): Promise<GpLink[]> {
  return apiFetch(config.gpAuthorisationUrl, '/gp-links', { token, query: filter });
}

export function getGpLink(token: string, id: string): Promise<GpLink> {
  return apiFetch(config.gpAuthorisationUrl, `/gp-links/${id}`, { token });
}

/** Requires a recent passkey/hardware-key step-up re-authentication server-side — see root CONVENTIONS.md §8. */
export function approveGpLink(token: string, id: string): Promise<GpLink> {
  return apiFetch(config.gpAuthorisationUrl, `/gp-links/${id}/approve`, { method: 'POST', token });
}

export function declineGpLink(token: string, id: string, reason?: string): Promise<GpLink> {
  return apiFetch(config.gpAuthorisationUrl, `/gp-links/${id}/decline`, { method: 'POST', token, body: { reason } });
}

export function revokeGpLink(token: string, id: string, reason?: string): Promise<GpLink> {
  return apiFetch(config.gpAuthorisationUrl, `/gp-links/${id}/revoke`, { method: 'POST', token, body: { reason } });
}
