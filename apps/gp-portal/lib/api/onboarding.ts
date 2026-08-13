import { config } from './config';
import { apiFetch } from './http';
import type { AccountActivationResult, GpPractice, IntegrationTier } from './types';

export interface RequestActivationInput {
  triggeringGpId: string;
  triggeringGpHpiO: string;
  patientGivenName: string;
  patientFamilyName: string;
  patientDateOfBirth: string;
  patientMobileNumber: string;
  patientEmail: string;
  patientMedicareNumber?: string;
}

/**
 * Module 1 of business-process-flow.md: the GP-triggered "start a new
 * patient account" request. KNOWN GAP inherited from
 * services/onboarding-account (see its own controller doc comment): this
 * route is not yet behind `requireAuth` server-side, so this app does not
 * yet send a bearer token here either — flagged, not silently worked around.
 */
export function requestAccountActivation(input: RequestActivationInput): Promise<AccountActivationResult> {
  return apiFetch(config.onboardingAccountUrl, '/account-activation-requests', { method: 'POST', body: input });
}

export interface RegisterGpPracticeInput {
  practiceName: string;
  hpiO: string;
  contactEmail: string;
  state: string;
  integrationTier?: IntegrationTier;
}

export function registerGpPractice(input: RegisterGpPracticeInput): Promise<GpPractice> {
  return apiFetch(config.onboardingAccountUrl, '/gp-practices', { method: 'POST', body: input });
}

export function getGpPractice(id: string): Promise<GpPractice> {
  return apiFetch(config.onboardingAccountUrl, `/gp-practices/${id}`);
}

export function acknowledgeComplianceChecklist(
  id: string,
  input: { acknowledgedByName: string; acknowledgedByEmail: string },
): Promise<GpPractice> {
  return apiFetch(config.onboardingAccountUrl, `/gp-practices/${id}/compliance-checklist/acknowledge`, {
    method: 'POST',
    body: input,
  });
}
