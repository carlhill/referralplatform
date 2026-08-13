import { Inject, Injectable } from '@nestjs/common';
import { KMS } from './kms.interface';
import type { Kms } from './kms.interface';

/**
 * Convention this service enforces: a payload's sensitive, crypto-shreddable
 * fields live under a top-level `payload.sensitive` object. Everything else
 * in `payload` is written to immudb in cleartext (structured, non-sensitive
 * metadata needed to make the audit trail useful — e.g. `{ urgent: true }`
 * on a referral.created event). Only `payload.sensitive.*` string values get
 * individually envelope-encrypted.
 *
 * Note on the layering with packages/shared-types' AuditEvent doc comment:
 * that comment says a writing service is expected to have already made
 * sensitive fields crypto-shredding-eligible before they reach this service.
 * In practice this service is the natural owner of the per-user KMS key
 * (crypto-shredding's "erasure" operation — destroying a key — has to live
 * wherever the key does), so it re-encrypts anything under `sensitive` with
 * its own KMS-backed key on the way in, rather than trusting the caller to
 * have called an unspecified encryption primitive itself. Documented
 * judgment call — see BUILD_LOG/audit-log.md.
 */
@Injectable()
export class CryptoShreddingService {
  constructor(@Inject(KMS) private readonly kms: Kms) {}

  /**
   * Returns a copy of `payload` with every string value under
   * `payload.sensitive` replaced by its ciphertext envelope, encrypted under
   * `ownerId`'s data key. Non-string values under `sensitive` are
   * JSON-stringified first. Leaves `payload` untouched if it has no
   * `sensitive` key.
   */
  async protectPayload(payload: Record<string, unknown>, ownerId: string): Promise<{ payload: Record<string, unknown>; shredded: boolean }> {
    const sensitive = payload.sensitive;
    if (sensitive === undefined || sensitive === null || typeof sensitive !== 'object') {
      return { payload, shredded: false };
    }

    const encryptedSensitive: Record<string, string> = {};
    for (const [field, value] of Object.entries(sensitive as Record<string, unknown>)) {
      const plaintext = typeof value === 'string' ? value : JSON.stringify(value);
      encryptedSensitive[field] = await this.kms.encrypt(ownerId, plaintext);
    }

    return { payload: { ...payload, sensitive: encryptedSensitive }, shredded: true };
  }

  /**
   * Inverse of protectPayload — decrypts `payload.sensitive.*` for an
   * authorized caller. Throws (propagating the Kms implementation's error)
   * if the owner's key has been crypto-shredded; callers should surface that
   * as "this data has been erased", not as a generic 500.
   */
  async revealPayload(payload: Record<string, unknown>, ownerId: string): Promise<Record<string, unknown>> {
    const sensitive = payload.sensitive;
    if (sensitive === undefined || sensitive === null || typeof sensitive !== 'object') {
      return payload;
    }

    const decryptedSensitive: Record<string, unknown> = {};
    for (const [field, ciphertext] of Object.entries(sensitive as Record<string, string>)) {
      const plaintext = await this.kms.decrypt(ownerId, ciphertext);
      try {
        decryptedSensitive[field] = JSON.parse(plaintext);
      } catch {
        decryptedSensitive[field] = plaintext;
      }
    }

    return { ...payload, sensitive: decryptedSensitive };
  }

  /** The actual GDPR/right-to-erasure operation — see kms.interface.ts. */
  async shredUser(ownerId: string): Promise<void> {
    await this.kms.shredKey(ownerId);
  }

  async hasLiveKey(ownerId: string): Promise<boolean> {
    return this.kms.hasLiveKey(ownerId);
  }
}
