import { NhsdSyncService, type NhsdSyncPrisma } from './nhsd-sync.service';
import type { NhsdDirectoryClient, NhsdProviderRecord } from './nhsd-client.interface';

interface FakeEntry {
  id: string;
  hpiI: string;
  selfRegisteredOverride: boolean;
  [key: string]: unknown;
}

class FakePrisma implements NhsdSyncPrisma {
  entries = new Map<string, FakeEntry>();
  runs: Array<{ id: string; status: string; [key: string]: unknown }> = [];
  private counter = 0;

  directorySyncRun = {
    create: async ({ data }: any) => {
      const run = { id: `run-${++this.counter}`, ...data };
      this.runs.push(run);
      return run;
    },
    update: async ({ where, data }: any) => {
      const run = this.runs.find((r) => r.id === where.id)!;
      Object.assign(run, data);
      return run;
    },
  };

  directoryEntry = {
    findUnique: async ({ where }: any) => this.entries.get(where.hpiI) ?? null,
    create: async ({ data }: any) => {
      const entry: FakeEntry = { id: `entry-${++this.counter}`, ...data };
      this.entries.set(data.hpiI, entry);
      return entry;
    },
    update: async ({ where, data }: any) => {
      const entry = this.entries.get(where.hpiI)!;
      Object.assign(entry, data);
      return entry;
    },
  };
}

function record(hpiI: string, overrides: Partial<NhsdProviderRecord> = {}): NhsdProviderRecord {
  return {
    hpiI,
    displayName: 'Dr NHSD Synced',
    subspecialty: 'Cardiology',
    practiceLocations: [{ name: 'Clinic', suburb: 'Suburb', state: 'NSW', postcode: '2000' }],
    consultingDays: ['Mon'],
    econsultOptIn: false,
    acceptsBookingsViaPlatform: false,
    ...overrides,
  };
}

class FakeNhsdClient implements NhsdDirectoryClient {
  records: NhsdProviderRecord[] = [];
  async fetchProviders(): Promise<NhsdProviderRecord[]> {
    return this.records;
  }
}

describe('NhsdSyncService', () => {
  let prisma: FakePrisma;
  let client: FakeNhsdClient;
  let service: NhsdSyncService;

  beforeEach(() => {
    prisma = new FakePrisma();
    client = new FakeNhsdClient();
    service = new NhsdSyncService(prisma as any, client);
  });

  it('creates new directory entries for previously-unseen hpiI values', async () => {
    client.records = [record('8003611111111111'), record('8003612222222222')];
    const result = await service.runSync();
    expect(result.fetched).toBe(2);
    expect(result.upserted).toBe(2);
    expect(result.skippedSelfRegistered).toBe(0);
    expect(prisma.entries.size).toBe(2);
  });

  it('is idempotent — re-running against the same dataset upserts the same rows, not duplicates', async () => {
    client.records = [record('8003611111111111')];
    await service.runSync();
    await service.runSync();
    expect(prisma.entries.size).toBe(1);
  });

  it('updates an existing nhsd_sync entry on re-sync', async () => {
    client.records = [record('8003611111111111', { displayName: 'Dr Original Name' })];
    await service.runSync();
    client.records = [record('8003611111111111', { displayName: 'Dr Updated Name' })];
    await service.runSync();
    expect(prisma.entries.get('8003611111111111')?.displayName).toBe('Dr Updated Name');
  });

  it('never overwrites a self-registered entry for the same hpiI', async () => {
    prisma.entries.set('8003611111111111', {
      id: 'entry-1',
      hpiI: '8003611111111111',
      selfRegisteredOverride: true,
      displayName: 'Dr Self Registered — do not touch',
    });
    client.records = [record('8003611111111111', { displayName: 'Dr NHSD Would Overwrite' })];

    const result = await service.runSync();

    expect(result.skippedSelfRegistered).toBe(1);
    expect(result.upserted).toBe(0);
    expect(prisma.entries.get('8003611111111111')?.displayName).toBe('Dr Self Registered — do not touch');
  });

  it('marks the sync run as failed and rethrows if fetchProviders() throws', async () => {
    const err = new Error('NHSD API unreachable (MOCK)');
    client.fetchProviders = async () => {
      throw err;
    };
    await expect(service.runSync()).rejects.toThrow(err);
    expect(prisma.runs[0].status).toBe('failed');
    expect(prisma.runs[0].errorMessage).toBe(err.message);
  });

  it('records run bookkeeping (fetched/upserted/skipped counts) on success', async () => {
    prisma.entries.set('8003613333333333', {
      id: 'entry-x',
      hpiI: '8003613333333333',
      selfRegisteredOverride: true,
    });
    client.records = [record('8003611111111111'), record('8003613333333333')];
    const result = await service.runSync();
    const run = prisma.runs.find((r) => r.id === result.runId)!;
    expect(run.status).toBe('completed');
    expect(run.recordsFetched).toBe(2);
    expect(run.recordsUpserted).toBe(1);
    expect(run.recordsSkippedSelfRegistered).toBe(1);
  });
});
