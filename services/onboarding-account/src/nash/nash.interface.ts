/**
 * Clean interface over NASH (National Authentication Service for Health)
 * credential provisioning for a specialist — see onboarding-processes.md
 * ("Onboarding process — Specialist", step 3). A real NASH credential is a
 * PKI certificate issued against an HPI-I, used to sign/authenticate
 * secure-messaging and My Health Record traffic — see nash.mock.ts for the
 * MOCK implementation used in this build.
 */
export interface ProvisionNashCredentialInput {
  hpiI: string;
  organisationName: string;
}

export interface ProvisionNashCredentialResult {
  nashCredentialId: string;
  status: 'issued';
  issuedAt: string;
}

export abstract class NashCredentialClient {
  abstract provision(input: ProvisionNashCredentialInput): Promise<ProvisionNashCredentialResult>;
}
