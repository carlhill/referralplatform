import { config } from './config';
import { apiFetch } from './http';
import type { DeceasedFlag } from './types';

export interface FlagDeceasedInput {
  patientId: string;
  flaggedByGpId: string;
  state: string;
  reason?: string;
}

export function flagPatientDeceased(token: string, input: FlagDeceasedInput): Promise<DeceasedFlag> {
  return apiFetch(config.consentSecurityUrl, '/deceased-flags', { method: 'POST', token, body: input });
}

/** Throws a 404 ApiError when the patient has no active deceased flag — see deceased-flags.controller.ts. */
export function getActiveDeceasedFlag(token: string, patientId: string): Promise<DeceasedFlag> {
  return apiFetch(config.consentSecurityUrl, `/deceased-flags/${patientId}`, { token });
}
