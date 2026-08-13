import type { AustralianState, DirectoryEntry } from '@referralplatform/shared-types';
import { apiFetch } from './http';

/**
 * Client for the Directory Service (services/directory, port 3006) — the
 * specialist's self-maintained profile, which always supersedes any
 * NHSD-synced copy for the same `hpiI`. See BUILD_LOG/directory.md.
 *
 * Documented gap: `docker-compose.yml`'s `specialist-portal:` block does
 * not set `NEXT_PUBLIC_DIRECTORY_SERVICE_URL` even though it lists
 * `directory` under `depends_on` — out of this app's scope to edit that
 * root-level file. Falls back to `http://localhost:3006` (that service's
 * own documented port), so it still works once the line is added.
 */
const BASE_URL = process.env.NEXT_PUBLIC_DIRECTORY_SERVICE_URL ?? 'http://localhost:3006';

export interface RegisterProfileInput {
  hpiI: string;
  displayName: string;
  subspecialty: string;
  practiceLocations: { name: string; suburb: string; state: AustralianState; postcode: string }[];
  consultingDays: string[];
  econsultOptIn?: boolean;
  acceptsBookingsViaPlatform?: boolean;
  onboardedForDirectDelivery?: boolean;
  secureMessagingVendor?: 'healthlink' | 'medical_objects';
  secureMessagingEndpointId?: string;
}

export function searchDirectory(
  filters: { q?: string; subspecialty?: string; state?: AustralianState; limit?: number; offset?: number } = {},
): Promise<DirectoryEntry[]> {
  return apiFetch<DirectoryEntry[]>(BASE_URL, '/directory/entries', { query: filters });
}

export function getDirectoryEntry(id: string): Promise<DirectoryEntry> {
  return apiFetch<DirectoryEntry>(BASE_URL, `/directory/entries/${id}`, {});
}

/**
 * Finds this specialist's own existing profile by `hpiI`, so the profile
 * page can load-then-edit rather than always starting blank. Client-side
 * workaround: `GET /directory/entries` (`SearchDirectoryQueryDto`) has no
 * `hpiI` filter param — it only matches `displayName`/`subspecialty`
 * free-text and a few boolean/state filters (see
 * services/directory/src/directory/directory.service.ts's `search()`) — so
 * this fetches a page of entries and filters for an exact `hpiI` match
 * in-process. Fine at this build's directory scale (the same "fine for
 * now, Postgres full-text search initially" scale note
 * BUILD_LOG/directory.md itself makes about `state` filtering); a real fix
 * is an additive `hpiI` query param on that service's search endpoint.
 */
export async function findMyProfileByHpiI(hpiI: string): Promise<DirectoryEntry | null> {
  const page = await searchDirectory({ limit: 200 });
  return page.find((entry) => entry.hpiI === hpiI) ?? null;
}

/** Always sets `source: 'self_registered'` / `selfRegisteredOverride: true` server-side — this profile now supersedes any NHSD sync for this hpiI. */
export function registerSelfProfile(accessToken: string | null, input: RegisterProfileInput): Promise<DirectoryEntry> {
  return apiFetch<DirectoryEntry>(BASE_URL, '/directory/entries/self', { accessToken, method: 'PUT', body: input });
}
