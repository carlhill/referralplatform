import { MockPathologyResultClient } from './pathology-result.client';

describe('MockPathologyResultClient', () => {
  const client = new MockPathologyResultClient();
  const dueDate = new Date('2026-01-01T00:00:00.000Z');

  it('reports a pathology-style test as available once 2+ days have passed since the due date', async () => {
    const now = new Date('2026-01-03T00:00:00.000Z');
    const [result] = await client.checkForResults('patient-1', ['HbA1c'], dueDate, now);
    expect(result.resultAvailable).toBe(true);
    expect(result.resultDate).toBeDefined();
  });

  it('reports unavailable before the 2-day turnaround has elapsed', async () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    const [result] = await client.checkForResults('patient-1', ['HbA1c'], dueDate, now);
    expect(result.resultAvailable).toBe(false);
    expect(result.resultDate).toBeUndefined();
  });

  it('never reports an imaging-style test as available — that source is My Health Record instead', async () => {
    const now = new Date('2026-06-01T00:00:00.000Z'); // long past any turnaround window
    const results = await client.checkForResults('patient-1', ['chest X-ray', 'CT scan', 'MRI brain'], dueDate, now);
    results.forEach((r) => expect(r.resultAvailable).toBe(false));
  });
});
