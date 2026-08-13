import { NotFoundException } from '@nestjs/common';
import { DirectoryService, type DirectoryEntryRecord, type DirectoryPrisma } from './directory.service';
import type { HealthPathwaysClient, PathwaySuggestion } from './healthpathways/healthpathways-client.interface';

function makeEntry(overrides: Partial<DirectoryEntryRecord> = {}): DirectoryEntryRecord {
  const now = new Date();
  return {
    id: overrides.id ?? `entry-${Math.random().toString(36).slice(2)}`,
    specialistId: null,
    hpiI: overrides.hpiI ?? null,
    source: 'nhsd_sync',
    selfRegisteredOverride: false,
    displayName: 'Dr Test Person',
    subspecialty: 'Cardiology',
    practiceLocations: [{ name: 'Test Clinic', suburb: 'Testville', state: 'NSW', postcode: '2000' }],
    consultingDays: ['Mon'],
    econsultOptIn: false,
    acceptsBookingsViaPlatform: false,
    onboardedForDirectDelivery: false,
    secureMessagingVendor: null,
    secureMessagingEndpointId: null,
    lastSyncedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Hand-rolled fake standing in for the DirectoryEntry slice of PrismaService. */
class FakePrisma implements DirectoryPrisma {
  entries: DirectoryEntryRecord[] = [];

  directoryEntry = {
    findMany: async ({ where, take, skip }: any): Promise<DirectoryEntryRecord[]> => {
      let results = [...this.entries];
      if (where?.subspecialty?.equals) {
        results = results.filter((e) => e.subspecialty.toLowerCase() === where.subspecialty.equals.toLowerCase());
      }
      if (where?.acceptsBookingsViaPlatform !== undefined) {
        results = results.filter((e) => e.acceptsBookingsViaPlatform === where.acceptsBookingsViaPlatform);
      }
      if (where?.econsultOptIn !== undefined) {
        results = results.filter((e) => e.econsultOptIn === where.econsultOptIn);
      }
      if (where?.OR) {
        const q = (where.OR[0]?.displayName?.contains ?? '').toLowerCase();
        results = results.filter(
          (e) => e.displayName.toLowerCase().includes(q) || e.subspecialty.toLowerCase().includes(q),
        );
      }
      results.sort((a, b) => a.displayName.localeCompare(b.displayName));
      return results.slice(skip ?? 0, (skip ?? 0) + (take ?? results.length));
    },
    findUnique: async ({ where }: any): Promise<DirectoryEntryRecord | null> => {
      if (where.id) return this.entries.find((e) => e.id === where.id) ?? null;
      if (where.hpiI) return this.entries.find((e) => e.hpiI === where.hpiI) ?? null;
      return null;
    },
    upsert: async ({ where, create, update }: any): Promise<DirectoryEntryRecord> => {
      const existing = this.entries.find((e) => e.hpiI === where.hpiI);
      if (existing) {
        Object.assign(existing, update, { updatedAt: new Date() });
        return existing;
      }
      const created = makeEntry({ ...create });
      this.entries.push(created);
      return created;
    },
  };
}

class FakeHealthPathwaysClient implements HealthPathwaysClient {
  shouldFail = false;
  async suggestPathway(): Promise<PathwaySuggestion> {
    if (this.shouldFail) {
      throw new Error('MOCK unavailable');
    }
    return {
      specialistType: 'Cardiologist',
      subspecialty: 'Cardiology',
      pathwayUrl: 'https://example.org/cardiology',
      confidence: 0.9,
      source: 'healthpathways',
    };
  }
}

describe('DirectoryService', () => {
  let prisma: FakePrisma;
  let healthPathways: FakeHealthPathwaysClient;
  let service: DirectoryService;

  beforeEach(() => {
    prisma = new FakePrisma();
    healthPathways = new FakeHealthPathwaysClient();
    service = new DirectoryService(prisma as any, healthPathways);
  });

  describe('search', () => {
    it('filters by subspecialty', async () => {
      prisma.entries.push(makeEntry({ subspecialty: 'Cardiology' }), makeEntry({ subspecialty: 'Dermatology' }));
      const results = await service.search({ subspecialty: 'Cardiology' } as any);
      expect(results).toHaveLength(1);
      expect(results[0].subspecialty).toBe('Cardiology');
    });

    it('filters by state within practiceLocations JSON, in-process', async () => {
      prisma.entries.push(
        makeEntry({ practiceLocations: [{ name: 'A', suburb: 'X', state: 'NSW', postcode: '2000' }] }),
        makeEntry({ practiceLocations: [{ name: 'B', suburb: 'Y', state: 'VIC', postcode: '3000' }] }),
      );
      const results = await service.search({ state: 'VIC' } as any);
      expect(results).toHaveLength(1);
    });

    it('filters by acceptsBookingsViaPlatform boolean string', async () => {
      prisma.entries.push(
        makeEntry({ acceptsBookingsViaPlatform: true }),
        makeEntry({ acceptsBookingsViaPlatform: false }),
      );
      const results = await service.search({ acceptsBookingsViaPlatform: 'true' } as any);
      expect(results).toHaveLength(1);
      expect(results[0].acceptsBookingsViaPlatform).toBe(true);
    });
  });

  describe('getById', () => {
    it('throws NotFoundException for an unknown id', async () => {
      await expect(service.getById('nope')).rejects.toThrow(NotFoundException);
    });

    it('returns the entry when found', async () => {
      const entry = makeEntry();
      prisma.entries.push(entry);
      await expect(service.getById(entry.id)).resolves.toEqual(entry);
    });
  });

  describe('registerSelfProfile', () => {
    it('creates a new self-registered entry with selfRegisteredOverride=true', async () => {
      const result = await service.registerSelfProfile({
        hpiI: '8003611234567890',
        displayName: 'Dr Self Registered',
        subspecialty: 'Neurology',
        practiceLocations: [{ name: 'Clinic', suburb: 'Suburb', state: 'NSW', postcode: '2000' }],
        consultingDays: ['Mon', 'Wed'],
      } as any);
      expect(result.source).toBe('self_registered');
      expect(result.selfRegisteredOverride).toBe(true);
      expect(result.displayName).toBe('Dr Self Registered');
    });

    it('is idempotent — calling twice for the same hpiI upserts the same record', async () => {
      const dto = {
        hpiI: '8003611234567890',
        displayName: 'Dr Self Registered',
        subspecialty: 'Neurology',
        practiceLocations: [{ name: 'Clinic', suburb: 'Suburb', state: 'NSW', postcode: '2000' }],
        consultingDays: ['Mon'],
      } as any;
      const first = await service.registerSelfProfile(dto);
      const second = await service.registerSelfProfile({ ...dto, displayName: 'Dr Updated Name' });
      expect(second.id).toBe(first.id);
      expect(second.displayName).toBe('Dr Updated Name');
      expect(prisma.entries).toHaveLength(1);
    });
  });

  describe('suggestPathway', () => {
    it('returns the HealthPathways suggestion plus matching directory entries', async () => {
      prisma.entries.push(makeEntry({ subspecialty: 'Cardiology' }));
      const result = await service.suggestPathway('chest pain on exertion', 'PHN123');
      expect(result.source).toBe('healthpathways');
      expect(result.subspecialty).toBe('Cardiology');
      expect(result.matchingDirectoryEntries).toHaveLength(1);
    });

    it('degrades gracefully to a static link when HealthPathways is unavailable', async () => {
      healthPathways.shouldFail = true;
      const result = await service.suggestPathway('chest pain on exertion');
      expect(result.source).toBe('static_fallback');
      expect(result.subspecialty).toBe('Cardiology');
      expect(result.pathwayUrl).toContain('healthpathways.org.au');
    });

    it('falls back to the general category for an unrecognised referral reason', async () => {
      healthPathways.shouldFail = true;
      const result = await service.suggestPathway('routine wellness check, nothing specific');
      expect(result.subspecialty).toBe('General Medicine');
    });
  });
});
