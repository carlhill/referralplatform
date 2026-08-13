import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockLocalKms } from './mock-local.kms';

describe('MockLocalKms', () => {
  let dir: string;
  let storePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mock-kms-test-'));
    storePath = join(dir, 'keystore.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('encrypts and decrypts a value for a user', async () => {
    const kms = new MockLocalKms(storePath);
    const ciphertext = await kms.encrypt('patient_1', 'Sensitive referral note');
    expect(ciphertext).not.toContain('Sensitive');

    const plaintext = await kms.decrypt('patient_1', ciphertext);
    expect(plaintext).toBe('Sensitive referral note');
  });

  it('isolates keys per user — one user cannot decrypt another user\'s ciphertext', async () => {
    const kms = new MockLocalKms(storePath);
    const ciphertext = await kms.encrypt('patient_1', 'secret');

    await expect(kms.decrypt('patient_2', ciphertext)).rejects.toThrow();
  });

  it('crypto-shredding: after shredKey, previously-encrypted data is permanently unreadable', async () => {
    const kms = new MockLocalKms(storePath);
    const ciphertext = await kms.encrypt('patient_1', 'secret referral detail');
    expect(await kms.hasLiveKey('patient_1')).toBe(true);

    await kms.shredKey('patient_1');

    expect(await kms.hasLiveKey('patient_1')).toBe(false);
    await expect(kms.decrypt('patient_1', ciphertext)).rejects.toThrow(/permanently unreadable|no live key/i);
  });

  it('persists keys across instances pointed at the same store path', async () => {
    const first = new MockLocalKms(storePath);
    const ciphertext = await first.encrypt('patient_1', 'secret');

    const second = new MockLocalKms(storePath);
    expect(await second.decrypt('patient_1', ciphertext)).toBe('secret');
  });

  it('issues a fresh key if a new value is encrypted for a user after shredding', async () => {
    const kms = new MockLocalKms(storePath);
    await kms.encrypt('patient_1', 'first');
    await kms.shredKey('patient_1');

    const ciphertext2 = await kms.encrypt('patient_1', 'second');
    expect(await kms.decrypt('patient_1', ciphertext2)).toBe('second');
  });
});
