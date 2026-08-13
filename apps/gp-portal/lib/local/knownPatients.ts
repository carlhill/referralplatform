'use client';

/**
 * Local (browser-only) recent-patient registry. There is no practice-wide
 * "list my patients" endpoint on any backend service (Follow-up & Recall's
 * `GET /follow-up-plans` and Referral's `GET /referrals` both require a
 * `patientId`/`gpId`, never return "every patient this practice has ever
 * referred"), so the Follow-up & Recall dashboard and the message inbox
 * (both meant to be practice-wide per claude/ui-design.md) aggregate over
 * patients this browser has locally seen (created a referral for, or
 * requested an account/link for) instead. This is a documented, honest
 * workaround, not a hidden limitation — see BUILD_LOG/gp-portal.md. A real
 * deployment would replace this with a server-side "GP's patient panel"
 * query once one exists.
 */
export interface KnownPatient {
  patientId: string;
  displayName: string;
  lastSeenAt: string;
}

const STORAGE_KEY = 'rp_gp_portal_known_patients';
const MAX_ENTRIES = 200;

export function loadKnownPatients(): KnownPatient[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as KnownPatient[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rememberPatient(patientId: string, displayName: string): void {
  if (typeof window === 'undefined' || !patientId) return;
  const existing = loadKnownPatients().filter((p) => p.patientId !== patientId);
  const next = [{ patientId, displayName, lastSeenAt: new Date().toISOString() }, ...existing].slice(0, MAX_ENTRIES);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
