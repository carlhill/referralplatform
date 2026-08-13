import { config } from './config';
import { apiFetch } from './http';

/**
 * The token-based onboarding flow (services/onboarding-account) —
 * deliberately NOT bearer-token authenticated (see that service's
 * onboarding.controller.ts doc comment): every call here is keyed off the
 * single-use activation token embedded in the SMS/email link, because the
 * whole point is activating an account for someone who does not yet have a
 * session. See identity-security-recommendations.md §3.
 */

export interface VerifyIdentityInput {
  dateOfBirth: string; // YYYY-MM-DD
  medicareNumber?: string;
}

export function verifyIdentity(token: string, input: VerifyIdentityInput): Promise<{ status: 'identity_verified' }> {
  return apiFetch(config.onboardingAccountUrl, `/account-activation/${encodeURIComponent(token)}/verify-identity`, {
    method: 'POST',
    body: input,
  });
}

export type CarerRelationship =
  'parent_guardian' | 'adult_child' | 'spouse_partner' | 'professional_support_worker' | 'other';

export interface CarerDetailsInput {
  givenName: string;
  familyName: string;
  email: string;
  relationship: CarerRelationship;
  sharesPatientMobileNumber: boolean;
  ownMobileNumber?: string;
}

export interface SelectBranchInput {
  role: 'patient' | 'carer';
  carer?: CarerDetailsInput;
}

export function selectBranch(
  token: string,
  input: SelectBranchInput,
): Promise<{ status: 'otp_sent'; otpDeliveryChannel: 'email' }> {
  return apiFetch(config.onboardingAccountUrl, `/account-activation/${encodeURIComponent(token)}/branch`, {
    method: 'POST',
    body: input,
  });
}

export function verifyOtp(
  token: string,
  code: string,
): Promise<{ status: 'activated'; patientId: string; role: 'patient' | 'carer'; queueExpiresAt: string }> {
  return apiFetch(config.onboardingAccountUrl, `/account-activation/${encodeURIComponent(token)}/otp/verify`, {
    method: 'POST',
    body: { code },
  });
}

export function resendOtp(token: string): Promise<{ status: 'otp_sent' }> {
  return apiFetch(config.onboardingAccountUrl, `/account-activation/${encodeURIComponent(token)}/otp/resend`, {
    method: 'POST',
  });
}
