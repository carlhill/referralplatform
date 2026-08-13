'use client';

/**
 * Local (browser-only) practice-profile cache. No backend endpoint exists to
 * ask "which GP practice is the signed-in GP a member of?" — GP practice
 * registration (`POST /gp-practices`) returns a practice id but nothing
 * links it back to the authenticated GP's Keycloak subject, and
 * `AuthenticatedPrincipal` doesn't carry an `hpiI`/practice claim either
 * (same documented gap `services/directory`'s BUILD_LOG calls out for
 * self-registration). Persisting the practice profile the GP just
 * registered/looked up in `localStorage` is a pragmatic, honestly-documented
 * workaround so the rest of the portal (referral creation's `gpState`,
 * GP-link requests' `practiceHpiO`) doesn't have to ask for it on every
 * screen — see BUILD_LOG/gp-portal.md.
 */
export interface PracticeProfile {
  practiceId: string;
  practiceName: string;
  hpiO: string;
  state: string;
  contactEmail: string;
  /** The signed-in GP's own id, as sent to services expecting a `gpId` (e.g. `POST /referrals`). Defaults to the Keycloak `sub`. */
  gpId: string;
}

const STORAGE_KEY = 'rp_gp_portal_practice_profile';

export function loadPracticeProfile(): PracticeProfile | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PracticeProfile;
  } catch {
    return null;
  }
}

export function savePracticeProfile(profile: PracticeProfile): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function clearPracticeProfile(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
