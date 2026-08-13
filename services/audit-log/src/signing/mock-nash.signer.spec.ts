import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockNashSigner } from './mock-nash.signer';

describe('MockNashSigner', () => {
  let dir: string;
  let keyPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nash-signer-test-'));
    keyPath = join(dir, 'key.pem');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('signs a payload and verifies its own signature', async () => {
    const signer = new MockNashSigner(keyPath);
    const payload = JSON.stringify({ id: 'evt_1', type: 'referral.created' });

    const result = await signer.sign(payload);

    expect(result.keyId).toMatch(/^mock-nash-/);
    expect(await signer.verify(payload, result.signature, result.keyId)).toBe(true);
  });

  it('rejects a signature if the payload was tampered with after signing', async () => {
    const signer = new MockNashSigner(keyPath);
    const original = JSON.stringify({ id: 'evt_1', amount: 100 });
    const tampered = JSON.stringify({ id: 'evt_1', amount: 999 });

    const result = await signer.sign(original);

    expect(await signer.verify(tampered, result.signature, result.keyId)).toBe(false);
  });

  it('rejects verification against an unknown keyId', async () => {
    const signer = new MockNashSigner(keyPath);
    const payload = JSON.stringify({ id: 'evt_1' });
    const result = await signer.sign(payload);

    expect(await signer.verify(payload, result.signature, 'mock-nash-someoneelse')).toBe(false);
  });

  it('persists and reloads the same keypair (same keyId) across instances', async () => {
    const first = new MockNashSigner(keyPath);
    const payload = JSON.stringify({ id: 'evt_1' });
    const signed = await first.sign(payload);

    const second = new MockNashSigner(keyPath);
    expect(await second.verify(payload, signed.signature, signed.keyId)).toBe(true);
  });
});
