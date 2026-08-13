/** Injection token — see crypto-shredding.module.ts. */
export const KMS = Symbol('KMS');

/**
 * Per-user envelope encryption + crypto-shredding, per
 * claude/audit-log-architecture-decision.md ("Crypto-shredding integration"):
 * sensitive field values are encrypted with a per-user key held in a
 * KMS/HSM layer before being written into an (otherwise immutable, forever
 * retained) audit entry. "Erasing" a user's data means destroying their key
 * here — every audit entry referencing that key becomes permanently
 * unreadable, while immudb's tamper-evidence chain (which never sees
 * plaintext, and never sees the key) remains structurally intact. This is
 * what reconciles "immutable append-only log" with a right-to-erasure
 * obligation.
 *
 * Pluggable so a real KMS/HSM implementation (AWS KMS/CloudHSM per
 * claude/solution-architecture-tech-stack.md) can be substituted without
 * touching CryptoShreddingService — see mock-local.kms.ts for the current
 * (mock) implementation.
 */
export interface Kms {
  /** Encrypts `plaintext` under `userId`'s data key, creating the key on first use. Returns an opaque ciphertext envelope string. */
  encrypt(userId: string, plaintext: string): Promise<string>;
  /** Decrypts a ciphertext envelope previously produced by encrypt() for the same userId. Throws if the key has been shredded or never existed. */
  decrypt(userId: string, ciphertext: string): Promise<string>;
  /** Irreversibly destroys `userId`'s data key. Every ciphertext previously encrypted under it becomes permanently undecryptable — this IS the erasure operation. */
  shredKey(userId: string): Promise<void>;
  /** Whether `userId` currently has a live (non-shredded) data key. */
  hasLiveKey(userId: string): Promise<boolean>;
}
