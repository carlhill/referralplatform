import { MockMyHealthRecordClient } from './my-health-record.client';

describe('MockMyHealthRecordClient', () => {
  const client = new MockMyHealthRecordClient();
  const dueDate = new Date('2026-01-01T00:00:00.000Z');

  it('reports any test as available once 4+ days have passed since the due date, including imaging', async () => {
    const now = new Date('2026-01-06T00:00:00.000Z');
    const results = await client.checkForResults('patient-1', ['chest X-ray', 'HbA1c'], dueDate, now);
    results.forEach((r) => {
      expect(r.resultAvailable).toBe(true);
      expect(r.resultDate).toBeDefined();
    });
  });

  it('reports unavailable before its (longer than pathology) turnaround window has elapsed', async () => {
    const now = new Date('2026-01-03T00:00:00.000Z'); // 2 days — enough for pathology, not for MHR
    const [result] = await client.checkForResults('patient-1', ['chest X-ray'], dueDate, now);
    expect(result.resultAvailable).toBe(false);
  });
});
