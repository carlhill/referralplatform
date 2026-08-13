import { config } from './config';
import { apiFetch } from './http';
import type { DirectoryEntry, PathwaySuggestion } from './types';

export function searchDirectory(
  query: { q?: string; subspecialty?: string; state?: string; limit?: number },
  token?: string,
): Promise<DirectoryEntry[]> {
  return apiFetch(config.directoryUrl, '/directory/entries', { token, query });
}

export function suggestPathway(referralReason: string, phnRegion?: string): Promise<PathwaySuggestion> {
  return apiFetch(config.directoryUrl, '/directory/pathway-suggestion', { query: { referralReason, phnRegion } });
}
