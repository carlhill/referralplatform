import { MockNhsdDirectoryClient } from './mock-nhsd-client';

describe('MockNhsdDirectoryClient', () => {
  it('returns a realistic, non-empty sample of Australian specialists', async () => {
    const client = new MockNhsdDirectoryClient();
    const records = await client.fetchProviders();

    expect(records.length).toBeGreaterThan(5);
    for (const record of records) {
      expect(record.hpiI).toMatch(/^\d{16}$/);
      expect(record.displayName.length).toBeGreaterThan(0);
      expect(record.subspecialty.length).toBeGreaterThan(0);
      expect(record.practiceLocations.length).toBeGreaterThan(0);
      for (const loc of record.practiceLocations) {
        expect(loc.postcode).toMatch(/^\d{4}$/);
      }
    }
  });

  it('has unique hpiI values across the sample (a real sync depends on this for idempotent upsert)', async () => {
    const client = new MockNhsdDirectoryClient();
    const records = await client.fetchProviders();
    const hpiIs = records.map((r) => r.hpiI);
    expect(new Set(hpiIs).size).toBe(hpiIs.length);
  });

  it('is repeatable — calling fetchProviders() twice returns the same dataset (idempotent sync source)', async () => {
    const client = new MockNhsdDirectoryClient();
    const first = await client.fetchProviders();
    const second = await client.fetchProviders();
    expect(second).toEqual(first);
  });
});
