/**
 * Preference-based slot ranking — the differentiator called out in
 * specialist-directory-booking.md: "the day-of-week/time-of-day
 * preference-driven matching idea is more specific than what Zocdoc's
 * search does today ... Patient sets a preference profile ... the matching
 * engine ranks them against the patient's preference profile and surfaces
 * the best-fit options first, rather than a flat chronological list."
 *
 * Pure function, no I/O — kept separate from BookingService/SlotsService so
 * the ranking rules are trivially unit-testable in isolation.
 */

export type TimeOfDayBand = 'morning' | 'afternoon' | 'evening';

/**
 * AU clinic-hours time bands (documented judgment call — not specified by
 * any project doc, arbitrary but reasonable): morning 06:00–11:59,
 * afternoon 12:00–16:59, evening 17:00–20:59. Slots outside 06:00–20:59
 * (shouldn't occur given MockCalendarClient's 09:00–17:00 clinic hours, but
 * handled defensively) fall through to 'evening'.
 */
export function timeOfDayBandFor(date: Date): TimeOfDayBand {
  const hour = date.getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function dayOfWeekNameFor(date: Date): string {
  return DAY_NAMES[date.getDay()];
}

export interface RankableSlot {
  id: string;
  startsAt: Date;
}

/**
 * Ranks open slots against a patient's preference profile, best fit first.
 * Tiers, per the doc's "surfaces the best-fit options first" (highest tier
 * wins; ties within a tier broken by soonest `startsAt`, matching Zocdoc's
 * "soonest availability" fallback signal referenced in the same doc):
 *
 *   3. day AND time-of-day both match
 *   2. day matches only
 *   1. time-of-day matches only
 *   0. neither matches (still offered — soonest-first fallback, never leave
 *      the patient with zero options just because nothing fits perfectly)
 *
 * With no preference supplied at all (both undefined — the urgent
 * fast-path's caller passes neither), every slot ties at tier 0 and the
 * result is a flat soonest-first list, matching
 * business-process-flow.md's "earliest available slot offered directly".
 */
export function rankSlotsByPreference<T extends RankableSlot>(
  slots: T[],
  preferredDayOfWeek?: string,
  preferredTimeOfDay?: TimeOfDayBand,
): T[] {
  const scored = slots.map((slot) => {
    const dayMatches = preferredDayOfWeek ? dayOfWeekNameFor(slot.startsAt) === preferredDayOfWeek.toLowerCase() : false;
    const timeMatches = preferredTimeOfDay ? timeOfDayBandFor(slot.startsAt) === preferredTimeOfDay : false;
    const score = (dayMatches ? 2 : 0) + (timeMatches ? 1 : 0);
    return { slot, score };
  });

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.slot.startsAt.getTime() - b.slot.startsAt.getTime();
  });

  return scored.map((s) => s.slot);
}
