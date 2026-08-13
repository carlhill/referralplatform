import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  HealthPathwaysClient,
  PathwaySuggestion,
  PathwaySuggestionRequest,
} from './healthpathways-client.interface';
import { matchPathwayCategory } from './static-pathway-links';

/**
 * MOCK — replace with real integration.
 *
 * The real HealthPathways "Pathway Link API" (Streamliners/Canterbury
 * Initiative's inline clinical-guidance product, licensed per-PHN) requires
 * a real PHN licence/API key this build does not have. This mock simulates
 * two things a real integration genuinely has to handle:
 *
 *  1. keyword-matching a referral reason to a pathway (a real integration
 *     would call HealthPathways' own NLP/search — this stands in with the
 *     same keyword table `static-pathway-links.ts` uses for the fallback);
 *  2. the "Phase 2 inline guidance not available for a given PHN region"
 *     case named explicitly in modules-and-requirements.md — simulated via
 *     `HEALTHPATHWAYS_UNAVAILABLE_PHNS` (a comma-separated env var of PHN
 *     region codes this mock treats as not-yet-licensed). Any region not in
 *     that list is treated as available. When unavailable, this client
 *     throws `HealthPathwaysUnavailableError`, and callers (see
 *     directory.service.ts's `suggestPathway`) are required to catch it and
 *     degrade to the static link rather than surfacing a 5xx to the GP.
 *
 * Swap this for a real HTTP client against HealthPathways' Pathway Link API
 * once a PHN licence/API key exists — `DirectoryService.suggestPathway`'s
 * call site doesn't need to change shape, only the `HEALTHPATHWAYS_CLIENT`
 * provider binding in `directory.module.ts`.
 */
@Injectable()
export class MockHealthPathwaysClient implements HealthPathwaysClient {
  private readonly logger = new Logger(MockHealthPathwaysClient.name);
  private readonly unavailablePhns: Set<string>;

  constructor(config: ConfigService) {
    const raw = config.get<string>('HEALTHPATHWAYS_UNAVAILABLE_PHNS', '');
    this.unavailablePhns = new Set(
      raw
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    );
  }

  async suggestPathway(request: PathwaySuggestionRequest): Promise<PathwaySuggestion> {
    if (request.phnRegion && this.unavailablePhns.has(request.phnRegion.toUpperCase())) {
      this.logger.warn(`HealthPathways inline guidance unavailable for PHN region ${request.phnRegion} (MOCK)`);
      throw new HealthPathwaysUnavailableError(request.phnRegion);
    }

    // Simulates real network latency so callers/tests exercise the async path honestly.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const match = matchPathwayCategory(request.referralReason);
    return {
      specialistType: match.specialistType,
      subspecialty: match.subspecialty,
      pathwayUrl: match.pathwayUrl,
      // A real inline-guidance match reports higher confidence than the static fallback's fixed 0.4.
      confidence: match.category === 'general' ? 0.3 : 0.85,
      source: 'healthpathways',
    };
  }
}

export class HealthPathwaysUnavailableError extends Error {
  constructor(public readonly phnRegion: string) {
    super(`HealthPathways inline guidance is not available for PHN region '${phnRegion}' (MOCK)`);
    this.name = 'HealthPathwaysUnavailableError';
  }
}
