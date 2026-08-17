/**
 * Day-of-week and hour resolution in the clinic's timezone rather than the server's.
 *
 * WHY THIS EXISTS. `slot-matching.ts` used `Date.getDay()` / `Date.getHours()`, which
 * read the *server process's* timezone. Containers here run UTC, so a patient asking
 * for "Wednesday afternoon" had their preference evaluated against UTC Wednesday
 * 12:00–17:00 — which in Sydney is Wednesday 22:00 through Thursday 03:00, i.e. the
 * middle of the night on the wrong day. For a platform whose entire market is
 * Australian, matching a booking preference against the server's timezone is a real
 * defect, not a formatting nicety. It was invisible in CI and Docker (both UTC) and
 * only surfaced as two failing tests on an Australian developer's machine.
 *
 * Resolution goes through `Intl.DateTimeFormat` with an explicit `timeZone`, so it is
 * correct across daylight-saving transitions without pulling in a date library.
 */

/**
 * The timezone a booking preference is interpreted in.
 *
 * NOTE: a single platform-wide zone is a simplification, and a deliberate one for now
 * — Australia spans five. The correct long-term model is per-practice (or per-slot)
 * timezone, since the specialist's local time is what a clinic appointment actually
 * means. Overridable via `CLINIC_TIME_ZONE` so a deployment can at least set its own
 * rather than inheriting whatever the container was started with.
 */
export const CLINIC_TIME_ZONE = process.env.CLINIC_TIME_ZONE ?? 'Australia/Sydney';

const WEEKDAY_HOUR_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: CLINIC_TIME_ZONE,
  weekday: 'long',
  hour: '2-digit',
  hour12: false,
});

export interface ZonedParts {
  /** Lowercase English day name, e.g. `'wednesday'`. */
  weekday: string;
  /** 0–23 in the clinic timezone. */
  hour: number;
}

export function clinicPartsFor(date: Date): ZonedParts {
  const parts = WEEKDAY_HOUR_FORMAT.formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value.toLowerCase() ?? '';
  // Some locales render midnight as "24" under hour12:false; normalise it.
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  return { weekday, hour };
}

const FULL_PARTS_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** How far the clinic timezone is ahead of UTC at a given instant, in ms. */
function clinicOffsetMsAt(instant: Date): number {
  const p = Object.fromEntries(FULL_PARTS_FORMAT.formatToParts(instant).map((x) => [x.type, x.value]));
  const asIfUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  return asIfUtc - instant.getTime();
}

/**
 * The instant at which the clinic's wall clock reads `date` `time`.
 *
 * `clinicWallClock('2026-09-02', '14:00')` → the `Date` for 2pm Sydney on that day,
 * whatever the server's timezone and whether or not daylight saving is in effect.
 *
 * Exists mainly so tests can state intent — "Wednesday afternoon at the clinic" —
 * rather than hard-coding a UTC instant that silently means something different in
 * another timezone. `new Date('2026-09-01T09:00:00')` (no offset) is parsed as *local*
 * time, which is how several booking tests ended up passing only on the machine they
 * were written on.
 */
export function clinicWallClock(date: string, time: string): Date {
  const naiveUtc = new Date(`${date}T${time}:00Z`);
  // Subtract the offset, then re-resolve once: near a DST boundary the offset at the
  // naive instant can differ from the offset at the true instant.
  const firstPass = new Date(naiveUtc.getTime() - clinicOffsetMsAt(naiveUtc));
  return new Date(naiveUtc.getTime() - clinicOffsetMsAt(firstPass));
}
