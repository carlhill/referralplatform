import { dayOfWeekNameFor, rankSlotsByPreference, timeOfDayBandFor } from './slot-matching';

describe('timeOfDayBandFor', () => {
  it('classifies morning/afternoon/evening correctly', () => {
    expect(timeOfDayBandFor(new Date('2026-09-01T09:00:00'))).toBe('morning');
    expect(timeOfDayBandFor(new Date('2026-09-01T13:00:00'))).toBe('afternoon');
    expect(timeOfDayBandFor(new Date('2026-09-01T18:00:00'))).toBe('evening');
  });
});

describe('dayOfWeekNameFor', () => {
  it('returns the lowercase day name', () => {
    // 2026-09-01 is a Tuesday
    expect(dayOfWeekNameFor(new Date('2026-09-01T09:00:00'))).toBe('tuesday');
  });
});

describe('rankSlotsByPreference', () => {
  const tuesdayMorning = { id: 'a', startsAt: new Date('2026-09-01T09:00:00') };
  const tuesdayAfternoon = { id: 'b', startsAt: new Date('2026-09-01T14:00:00') };
  const wednesdayMorning = { id: 'c', startsAt: new Date('2026-09-02T09:00:00') };
  const wednesdayEvening = { id: 'd', startsAt: new Date('2026-09-02T18:00:00') };

  it('ranks a slot matching both day and time-of-day first', () => {
    const ranked = rankSlotsByPreference(
      [wednesdayEvening, tuesdayAfternoon, wednesdayMorning, tuesdayMorning],
      'tuesday',
      'morning',
    );
    expect(ranked[0].id).toBe('a'); // tuesday + morning: full match
  });

  it('ranks day-only matches above time-only matches', () => {
    const ranked = rankSlotsByPreference([wednesdayMorning, tuesdayAfternoon], 'tuesday', 'morning');
    // tuesdayAfternoon: day matches, time doesn't (score 2)
    // wednesdayMorning: day doesn't match, time matches (score 1)
    expect(ranked[0].id).toBe('b');
    expect(ranked[1].id).toBe('c');
  });

  it('falls back to soonest-first when nothing matches preference', () => {
    // Neither slot's day is 'friday'; neither slot's time-of-day is 'afternoon'
    // (tuesdayMorning is morning, wednesdayEvening is evening) — both score 0, soonest first.
    const ranked = rankSlotsByPreference([wednesdayEvening, tuesdayMorning], 'friday', 'afternoon');
    expect(ranked[0].id).toBe('a');
    expect(ranked[1].id).toBe('d');
  });

  it('degrades to a flat soonest-first list when no preference is given at all (urgent fast-path)', () => {
    const ranked = rankSlotsByPreference([wednesdayEvening, tuesdayMorning, tuesdayAfternoon]);
    expect(ranked.map((s) => s.id)).toEqual(['a', 'b', 'd']);
  });
});
