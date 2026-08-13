import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Logger } from '@nestjs/common';
import type { SignResult, Signer } from './signer.interface';

/**
 * ============================================================================
 * MOCK — replace with real integration.
 * ============================================================================
 * Production NASH signing uses the organisation's NASH-issued certificate,
 * held in an HSM/KMS (see claude/solution-architecture-tech-stack.md) — the
 * private key material never leaves that boundary and every service that
 * signs does so via a network call to the HSM, not by loading a PEM file off
 * local disk. NASH (the National Authentication Service for Health) issuance
 * and certificate lifecycle also requires a real registration with Services
 * Australia, which this repo obviously cannot perform.
 *
 * What this mock actually does, for local dev / MVP demonstration of the
 * "sign before write" flow: generates (or loads, if already present) a local
 * Ed25519 keypair at `keyPath`, and signs/verifies with it. It satisfies the
 * *shape* of the Signer interface (see signer.interface.ts) so the rest of
 * the write path — "sign, then write to immudb, then persist the keyId
 * alongside the entry" — is real, working code, exercising the exact
 * integration point where the real NASH signer will be substituted in.
 * ============================================================================
 */
export class MockNashSigner implements Signer {
  private readonly logger = new Logger(MockNashSigner.name);
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private readonly keyId: string;

  constructor(private readonly keyPath: string) {
    this.privateKey = this.loadOrGenerate(keyPath);
    this.publicKey = createPublicKey(this.privateKey);
    const publicDer = this.publicKey.export({ type: 'spki', format: 'der' });
    // "mock-nash-" prefix makes it unmistakable in any audit entry or log
    // line that this was not a real NASH-issued certificate.
    this.keyId = `mock-nash-${createHash('sha256').update(publicDer).digest('hex').slice(0, 16)}`;
  }

  private loadOrGenerate(keyPath: string): KeyObject {
    if (existsSync(keyPath)) {
      return createPrivateKey(readFileSync(keyPath, 'utf8'));
    }
    this.logger.warn(
      `MOCK NASH signing key not found at '${keyPath}' — generating a new local Ed25519 keypair for dev use. ` +
        'This is NOT a real NASH-issued key; see mock-nash.signer.ts.',
    );
    const { privateKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    mkdirSync(dirname(keyPath), { recursive: true });
    writeFileSync(keyPath, pem, { mode: 0o600 });
    return privateKey;
  }

  async sign(canonicalPayload: string): Promise<SignResult> {
    const signature = sign(null, Buffer.from(canonicalPayload, 'utf8'), this.privateKey);
    return { signature: signature.toString('base64'), keyId: this.keyId, algorithm: 'Ed25519 (MOCK NASH key)' };
  }

  async verify(canonicalPayload: string, signature: string, keyId: string): Promise<boolean> {
    if (keyId !== this.keyId) {
      // Signed by a different key than the one this instance holds — cannot
      // verify locally. A real implementation would look the signer's
      // public certificate up (e.g. via the NASH directory) by keyId.
      return false;
    }
    try {
      return verify(null, Buffer.from(canonicalPayload, 'utf8'), this.publicKey, Buffer.from(signature, 'base64'));
    } catch {
      return false;
    }
  }
}
