/**
 * Clean interface over AHPRA's public register lookup — a free, individual,
 * on-demand check of current practitioner registration and specialty, per
 * onboarding-processes.md ("Onboarding process — Specialist", step 1: "not a
 * bulk pull"). See ahpra.mock.ts for the MOCK implementation used in this
 * build.
 */
export interface VerifyAhpraRegistrationInput {
  ahpraNumber: string;
  familyName: string;
}

export interface VerifyAhpraRegistrationResult {
  verified: boolean;
  /** e.g. 'Registered', 'Suspended', 'Cancelled' — only meaningful when verified. */
  registrationStatus?: string;
  /** e.g. 'General Practice', 'Cardiology' — only meaningful when verified. */
  specialty?: string;
  reason?: string;
}

export abstract class AhpraVerificationClient {
  abstract verifyRegistration(input: VerifyAhpraRegistrationInput): Promise<VerifyAhpraRegistrationResult>;
}
