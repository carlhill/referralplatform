/**
 * Clean interface over the real-world Healthcare Identifiers (HI) Service —
 * the Services Australia system that issues and resolves IHI (patients),
 * HPI-O (organisations/practices), and HPI-I (individual practitioners)
 * numbers. Every real integration (the Healthcare Identifiers Service SOAP/
 * REST API, reached via NASH-authenticated PCEHR/HI web services) is behind
 * this interface — see hi-service.mock.ts for the MOCK implementation used
 * in this build, and BUILD_LOG/onboarding-account.md for why no real
 * integration exists here (it requires NASH/PKI credentials this build
 * doesn't have).
 */
export interface ResolveIhiInput {
  givenName: string;
  familyName: string;
  dateOfBirth: string; // ISO date, YYYY-MM-DD
  medicareNumber?: string;
}

export type MatchConfidence = 'exact' | 'probable' | 'none';

export interface ResolveIhiResult {
  ihi: string | null;
  matchConfidence: MatchConfidence;
}

export interface VerifyHpioInput {
  hpiO: string;
  practiceName: string;
}

export interface VerifyHpioResult {
  verified: boolean;
  reason?: string;
}

export interface ResolveHpiiInput {
  ahpraNumber: string;
  givenName: string;
  familyName: string;
}

export interface ResolveHpiiResult {
  hpiI: string | null;
  resolved: boolean;
  reason?: string;
}

/**
 * The abstract surface this service programs against. `HiServiceClient` is
 * the injection token used throughout src/hi-service, src/onboarding,
 * src/gp-practices, and src/specialists — swap `MockHiServiceClient` for a
 * real NASH-authenticated implementation without touching any caller.
 */
export abstract class HiServiceClient {
  abstract resolveIhi(input: ResolveIhiInput): Promise<ResolveIhiResult>;
  abstract verifyHpio(input: VerifyHpioInput): Promise<VerifyHpioResult>;
  abstract resolveHpii(input: ResolveHpiiInput): Promise<ResolveHpiiResult>;
}
