import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Logger } from '@nestjs/common';
import type { Kms } from './kms.interface';

interface KeyRecord {
  keyId: string;
  /** base64 — see the class doc comment for why this is fine in a MOCK only. */
  keyMaterialBase64: string;
  createdAt: string;
  shredded: boolean;
  shreddedAt?: string;
}

const ALGORITHM = 'aes-256-gcm';

/**
 * ============================================================================
 * MOCK — replace with real integration.
 * ============================================================================
 * Production key material lives in AWS KMS/CloudHSM (see
 * claude/solution-architecture-tech-stack.md) — per-user data keys are
 * generated and used inside the HSM boundary (or via envelope encryption
 * with a KMS-held master key); plaintext key material is never written to a
 * plain JSON file on a service's local disk, which is exactly what this mock
 * does. This exists purely to make the crypto-shredding *mechanism* (encrypt
 * with a per-user key → later, destroy that key → ciphertext becomes
 * permanently unreadable) real and testable end-to-end before a real KMS
 * integration is wired in — swap this class for a real one behind the same
 * `Kms` interface (see kms.interface.ts) and nothing else in this service
 * changes.
 * ============================================================================
 */
export class MockLocalKms implements Kms {
  private readonly logger = new Logger(MockLocalKms.name);
  private readonly keys = new Map<string, KeyRecord>();

  constructor(private readonly storePath: string) {
    this.load();
  }

  private load(): void {
    if (!existsSync(this.storePath)) return;
    try {
      const raw = JSON.parse(readFileSync(this.storePath, 'utf8')) as Record<string, KeyRecord>;
      for (const [userId, record] of Object.entries(raw)) {
        this.keys.set(userId, record);
      }
    } catch (err) {
      this.logger.warn(`Could not read mock KMS keystore at '${this.storePath}': ${(err as Error).message}`);
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.storePath), { recursive: true });
    const obj: Record<string, KeyRecord> = {};
    for (const [userId, record] of this.keys) obj[userId] = record;
    writeFileSync(this.storePath, JSON.stringify(obj, null, 2), { mode: 0o600 });
  }

  private getOrCreateRecord(userId: string): KeyRecord {
    const existing = this.keys.get(userId);
    if (existing && !existing.shredded) return existing;
    const record: KeyRecord = {
      keyId: `mock-kms-${randomUUID()}`,
      keyMaterialBase64: randomBytes(32).toString('base64'),
      createdAt: new Date().toISOString(),
      shredded: false,
    };
    this.keys.set(userId, record);
    this.persist();
    return record;
  }

  async encrypt(userId: string, plaintext: string): Promise<string> {
    const record = this.getOrCreateRecord(userId);
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, Buffer.from(record.keyMaterialBase64, 'base64'), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Opaque envelope: version:keyId:iv:authTag:ciphertext, all base64 (base64
    // never contains ':', so this is unambiguously splittable).
    return ['v1', record.keyId, iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
  }

  async decrypt(userId: string, ciphertext: string): Promise<string> {
    const [version, keyId, ivB64, authTagB64, dataB64] = ciphertext.split(':');
    if (version !== 'v1') {
      throw new Error(`Unsupported crypto-shredding envelope version: '${version}'`);
    }
    const record = this.keys.get(userId);
    if (!record || record.shredded || record.keyId !== keyId) {
      throw new Error(
        `Cannot decrypt: no live key for user '${userId}' (key destroyed or never issued). ` +
          'This is the intended crypto-shredding behaviour, not a bug, once shredKey() has been called.',
      );
    }
    const decipher = createDecipheriv(ALGORITHM, Buffer.from(record.keyMaterialBase64, 'base64'), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return plaintext.toString('utf8');
  }

  async shredKey(userId: string): Promise<void> {
    const record = this.keys.get(userId);
    if (!record) return;
    record.shredded = true;
    record.shreddedAt = new Date().toISOString();
    record.keyMaterialBase64 = ''; // discard the key material itself, not just the flag
    this.persist();
    this.logger.warn(`Crypto-shredded data key for user '${userId}' — their encrypted audit payload fields are now permanently unreadable.`);
  }

  async hasLiveKey(userId: string): Promise<boolean> {
    const record = this.keys.get(userId);
    return !!record && !record.shredded;
  }
}
