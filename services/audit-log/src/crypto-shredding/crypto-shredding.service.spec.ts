import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CryptoShreddingService } from './crypto-shredding.service';
import { MockLocalKms } from './mock-local.kms';

describe('CryptoShreddingService', () => {
  let dir: string;
  let service: CryptoShreddingService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'crypto-shredding-test-'));
    service = new CryptoShreddingService(new MockLocalKms(join(dir, 'keystore.json')));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('leaves a payload with no `sensitive` key untouched', async () => {
    const payload = { urgent: true, specialty: 'cardiology' };
    const { payload: protectedPayload, shredded } = await service.protectPayload(payload, 'patient_1');
    expect(protectedPayload).toEqual(payload);
    expect(shredded).toBe(false);
  });

  it('encrypts payload.sensitive.* fields and round-trips via revealPayload', async () => {
    const payload = { urgent: true, sensitive: { clinicalNote: 'Patient reports chest pain', dob: '1990-01-01' } };

    const { payload: protectedPayload, shredded } = await service.protectPayload(payload, 'patient_1');
    expect(shredded).toBe(true);
    expect(protectedPayload.urgent).toBe(true);
    expect((protectedPayload.sensitive as Record<string, string>).clinicalNote).not.toContain('chest pain');

    const revealed = await service.revealPayload(protectedPayload, 'patient_1');
    expect(revealed.sensitive).toEqual(payload.sensitive);
  });

  it('revealPayload throws once the owner\'s key has been crypto-shredded', async () => {
    const payload = { sensitive: { note: 'confidential' } };
    const { payload: protectedPayload } = await service.protectPayload(payload, 'patient_1');

    await service.shredUser('patient_1');

    await expect(service.revealPayload(protectedPayload, 'patient_1')).rejects.toThrow();
  });
});
