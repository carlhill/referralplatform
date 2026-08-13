import {
  computeInitialReminderSchedule,
  computeEscalationReminders,
  escalationOffsetDays,
  ESCALATION_OFFSETS_DAYS,
} from './reminder-scheduling';

describe('computeInitialReminderSchedule', () => {
  it('schedules a GP courtesy-call reminder 30 days before due date, and patient reminders at 14/7/1 days before, when the plan is created well ahead of time', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const dueDate = new Date('2026-06-01T00:00:00.000Z'); // ~5 months out
    const schedule = computeInitialReminderSchedule(dueDate, now);

    expect(schedule).toHaveLength(4);
    const gp = schedule.find((r) => r.recipientType === 'gp')!;
    expect(gp.channel).toBe('secure_message');
    expect(gp.scheduledFor.toISOString()).toBe(new Date(dueDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const sms = schedule.find((r) => r.channel === 'sms')!;
    expect(sms.scheduledFor.toISOString()).toBe(new Date(dueDate.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString());

    const email = schedule.find((r) => r.channel === 'email')!;
    expect(email.scheduledFor.toISOString()).toBe(new Date(dueDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const push = schedule.find((r) => r.channel === 'push')!;
    expect(push.scheduledFor.toISOString()).toBe(new Date(dueDate.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString());

    schedule.forEach((r) => expect(r.escalationLevel).toBe(0));
  });

  it('clamps every reminder to "now" instead of scheduling any of them in the past, for a short follow-up window', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const dueDate = new Date('2026-01-05T00:00:00.000Z'); // only 4 days out — every offset would be in the past
    const schedule = computeInitialReminderSchedule(dueDate, now);

    expect(schedule).toHaveLength(4);
    for (const reminder of schedule) {
      expect(reminder.scheduledFor.getTime()).toBeGreaterThanOrEqual(now.getTime());
    }
  });
});

describe('escalationOffsetDays', () => {
  it('returns the hand-tuned cadence for levels 1-6', () => {
    ESCALATION_OFFSETS_DAYS.forEach((expected, index) => {
      expect(escalationOffsetDays(index + 1)).toBe(expected);
    });
  });

  it('settles into a flat 14-day repeat beyond the predefined levels', () => {
    const lastDefined = ESCALATION_OFFSETS_DAYS[ESCALATION_OFFSETS_DAYS.length - 1];
    expect(escalationOffsetDays(ESCALATION_OFFSETS_DAYS.length + 1)).toBe(lastDefined + 14);
    expect(escalationOffsetDays(ESCALATION_OFFSETS_DAYS.length + 2)).toBe(lastDefined + 28);
  });

  it('throws for a level below 1', () => {
    expect(() => escalationOffsetDays(0)).toThrow();
  });
});

describe('computeEscalationReminders', () => {
  it('always schedules a patient+GP pair at the given level', () => {
    const now = new Date('2026-06-05T00:00:00.000Z');
    const dueDate = new Date('2026-06-01T00:00:00.000Z');
    const wave = computeEscalationReminders(dueDate, 1, now);

    expect(wave).toHaveLength(2);
    expect(wave.map((r) => r.recipientType).sort()).toEqual(['gp', 'patient']);
    wave.forEach((r) => expect(r.escalationLevel).toBe(1));
  });

  it('clamps to now if the computed escalation date has already passed', () => {
    const now = new Date('2026-07-01T00:00:00.000Z');
    const dueDate = new Date('2026-06-01T00:00:00.000Z'); // level 1 (offset 0) would be June 1st, long past
    const wave = computeEscalationReminders(dueDate, 1, now);

    wave.forEach((r) => expect(r.scheduledFor.getTime()).toBe(now.getTime()));
  });
});
