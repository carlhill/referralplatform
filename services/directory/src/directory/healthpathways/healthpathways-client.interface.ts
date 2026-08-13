export interface PathwaySuggestionRequest {
  /** Free-text referral reason as entered by the GP, e.g. "chest pain on exertion". */
  referralReason: string;
  /** Primary Health Network region, when known — HealthPathways content is region-licensed. */
  phnRegion?: string;
}

export interface PathwaySuggestion {
  specialistType: string;
  subspecialty: string;
  pathwayUrl: string;
  /** 0–1 — how confident the match is; static fallback always reports a fixed, conservative confidence. */
  confidence: number;
  source: 'healthpathways' | 'static_fallback';
}

/**
 * Clean interface over the real HealthPathways "Pathway Link API" — see
 * mock-healthpathways-client.ts for what's mocked and why.
 */
export interface HealthPathwaysClient {
  suggestPathway(request: PathwaySuggestionRequest): Promise<PathwaySuggestion>;
}

export const HEALTHPATHWAYS_CLIENT = Symbol('HEALTHPATHWAYS_CLIENT');
