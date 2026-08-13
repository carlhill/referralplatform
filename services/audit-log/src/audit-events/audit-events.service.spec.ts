import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CryptoShreddingService } from '../crypto-shredding/crypto-shredding.service';
import { MockLocalKms } from '../crypto-shredding/mock-local.kms';
import type { ImmudbService } from '../immudb/immudb.service';
import type { PrismaService } from '../prisma/prisma.service';
import { MockNashSigner } from '../signing/mock-nash.signer';
import { AuditEventsService } from './audit-events.service';
import type { CreateAuditEventDto } from './dto/create-audit-event.dto';

/**
 * These are unit tests against a fake in-memory immudb + Postgres index —
 * not integration tests against real immudb/Postgres containers (this repo's
 * docker-compose stack; not reachable from this test run). The fakes
 * implement exactly the two methods AuditEventsService calls on each
 * (verifiedSet/verifiedGet, and the AuditEventIndex CRUD Prisma generates),
 * so the business logic under test — crypto-shredding, NASH signing,
 * tamper-evidence verification — is exercised for real.
 */
function makeFakeImmudb() {
  const store = new Map<string, { txId: string; value: string }>();
  let nextTx = 1;
  return {
    async verifiedSet(key: string, value: string) {
      const txId = String(nextTx++);
      store.set(key, { txId, value });
      return { txId };
    },
    async verifiedGet(key: string) {
      const entry = store.get(key);
      if (!entry) throw new Error(`not found: ${key}`);
      return { txId: entry.txId, value: entry.value };
    },
    // test-only helper to simulate tampering with what's "on disk" in immudb
    __tamper(key: string, mutate: (value: string) => string) {
      const entry = store.get(key);
      if (!entry) throw new Error(`not found: ${key}`);
      entry.value = mutate(entry.value);
    },
  } as unknown as ImmudbService & { __tamper: (key: string, mutate: (value: string) => string) => void };
}

function makeFakePrisma() {
  const rows = new Map<string, any>();
  return {
    auditEventIndex: {
      async create({ data }: { data: any }) {
        rows.set(data.id, data);
        return data;
      },
      async findUnique({ where: { id } }: { where: { id: string } }) {
        return rows.get(id) ?? null;
      },
      async findMany({ where }: { where: { subjectType: string; subjectId: string } }) {
        return [...rows.values()].filter((r) => r.subjectType === where.subjectType && r.subjectId === where.subjectId);
      },
    },
  } as unknown as PrismaService;
}

describe('AuditEventsService', () => {
  let dir: string;
  let service: AuditEventsService;
  let fakeImmudb: ReturnType<typeof makeFakeImmudb>;
  let fakePrisma: PrismaService;

  const baseInput: CreateAuditEventDto = {
    type: 'referral.created',
    actor: { principalType: 'gp', id: 'gp_1', healthcareIdentifier: 'HPI-I-123' } as any,
    subject: { type: 'Referral', id: 'ref_1' } as any,
    payload: { urgent: true },
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'audit-events-test-'));
    fakeImmudb = makeFakeImmudb();
    fakePrisma = makeFakePrisma();
    const kms = new MockLocalKms(join(dir, 'kms.json'));
    const signer = new MockNashSigner(join(dir, 'nash.pem'));
    service = new AuditEventsService(fakePrisma, fakeImmudb as unknown as ImmudbService, new CryptoShreddingService(kms), signer);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('records an event, signs it, and writes it to immudb', async () => {
    const result = await service.record(baseInput);

    expect(result.id).toBeDefined();
    expect(result.type).toBe('referral.created');
    expect(result.immudbTxId).toBe('1');
    expect(result.nashSignature).toBeDefined();
    expect(result.payload).toEqual({ urgent: true });
  });

  it('round-trips through getById', async () => {
    const written = await service.record(baseInput);
    const fetched = await service.getById(written.id);
    expect(fetched).toMatchObject({ id: written.id, type: 'referral.created', payload: { urgent: true } });
  });

  it('crypto-shreds payload.sensitive fields before writing, and reveals them only on request', async () => {
    const withSensitive: CreateAuditEventDto = {
      ...baseInput,
      subject: { type: 'Patient', id: 'patient_1' } as any,
      payload: { urgent: true, sensitive: { clinicalNote: 'chest pain reported' } },
    };

    const written = await service.record(withSensitive);
    // What's actually stored is ciphertext, not the plaintext note.
    expect(JSON.stringify(written.payload)).not.toContain('chest pain');

    const plain = await service.getById(written.id);
    expect(JSON.stringify(plain.payload)).not.toContain('chest pain');

    const revealed = await service.getById(written.id, { revealSensitive: true });
    expect((revealed.payload.sensitive as any).clinicalNote).toBe('chest pain reported');
  });

  it('lists events for a subject in occurredAt order', async () => {
    await service.record({ ...baseInput, occurredAt: '2026-01-01T00:00:00.000Z' });
    await service.record({ ...baseInput, occurredAt: '2026-01-02T00:00:00.000Z' });

    const list = await service.listForSubject('Referral', 'ref_1');
    expect(list).toHaveLength(2);
    expect(list[0].occurredAt < list[1].occurredAt).toBe(true);
  });

  it('verify() reports valid:true for an untampered entry', async () => {
    const written = await service.record(baseInput);
    const result = await service.verify(written.id);
    expect(result.valid).toBe(true);
    expect(result.details).toEqual({ immudbProofValid: true, nashSignatureValid: true });
  });

  it('verify() reports valid:false if the stored envelope was tampered with', async () => {
    const written = await service.record(baseInput);
    const index = await (fakePrisma as any).auditEventIndex.findUnique({ where: { id: written.id } });

    fakeImmudb.__tamper(index.immudbKey, (raw) => {
      const parsed = JSON.parse(raw);
      parsed.payload.urgent = false; // mutate content after the fact
      return JSON.stringify(parsed);
    });

    const result = await service.verify(written.id);
    expect(result.valid).toBe(false);
    expect(result.details.nashSignatureValid).toBe(false);
  });
});
