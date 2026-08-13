import { config } from './config';
import { apiFetch } from './http';
import type { GpAuthorisationCheck, GpLink, GpLinkStatus } from './types';

export interface CreateGpLinkInput {
  patientId: string;
  gpId: string;
  practiceHpiO: string;
  urgentEscalation?: boolean;
  urgentJustification?: string;
}

export function requestGpLink(token: string, input: CreateGpLinkInput): Promise<GpLink> {
  return apiFetch(config.gpAuthorisationUrl, '/gp-links', { method: 'POST', token, body: input });
}

export function listGpLinks(
  token: string,
  filter: { patientId?: string; gpId?: string; status?: GpLinkStatus },
): Promise<GpLink[]> {
  return apiFetch(config.gpAuthorisationUrl, '/gp-links', { token, query: filter });
}

export function checkAuthorisation(token: string, patientId: string, gpId: string): Promise<GpAuthorisationCheck> {
  return apiFetch(config.gpAuthorisationUrl, '/gp-links/authorisation', { token, query: { patientId, gpId } });
}

export function getGpLink(token: string, id: string): Promise<GpLink> {
  return apiFetch(config.gpAuthorisationUrl, `/gp-links/${id}`, { token });
}
