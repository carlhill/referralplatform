import { HealthPathwaysUnavailableError, MockHealthPathwaysClient } from './mock-healthpathways-client';

class FakeConfigService {
  constructor(private readonly values: Record<string, string> = {}) {}
  get<T>(key: string, defaultValue?: T): T {
    return (this.values[key] as unknown as T) ?? (defaultValue as T);
  }
}

describe('MockHealthPathwaysClient', () => {
  it('matches a referral reason to the right specialist type/subspecialty', async () => {
    const client = new MockHealthPathwaysClient(new FakeConfigService() as any);
    const result = await client.suggestPathway({ referralReason: 'chest pain on exertion' });
    expect(result.specialistType).toBe('Cardiologist');
    expect(result.subspecialty).toBe('Cardiology');
    expect(result.source).toBe('healthpathways');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('is case-insensitive and matches on partial phrase', async () => {
    const client = new MockHealthPathwaysClient(new FakeConfigService() as any);
    const result = await client.suggestPathway({ referralReason: 'Reflux and heartburn for 3 months' });
    expect(result.subspecialty).toBe('Gastroenterology');
  });

  it('falls back to the general category with lower confidence for an unrecognised reason', async () => {
    const client = new MockHealthPathwaysClient(new FakeConfigService() as any);
    const result = await client.suggestPathway({ referralReason: 'general check-up' });
    expect(result.subspecialty).toBe('General Medicine');
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('throws HealthPathwaysUnavailableError for a configured unavailable PHN region', async () => {
    const client = new MockHealthPathwaysClient(
      new FakeConfigService({ HEALTHPATHWAYS_UNAVAILABLE_PHNS: 'PHN999, PHN123' }) as any,
    );
    await expect(client.suggestPathway({ referralReason: 'chest pain', phnRegion: 'phn123' })).rejects.toThrow(
      HealthPathwaysUnavailableError,
    );
  });

  it('does not throw for a PHN region not in the unavailable list', async () => {
    const client = new MockHealthPathwaysClient(
      new FakeConfigService({ HEALTHPATHWAYS_UNAVAILABLE_PHNS: 'PHN999' }) as any,
    );
    await expect(client.suggestPathway({ referralReason: 'chest pain', phnRegion: 'PHN123' })).resolves.toBeDefined();
  });
});
