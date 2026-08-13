/** Injection token — see signing.module.ts. */
export const NASH_SIGNER = Symbol('NASH_SIGNER');

export interface SignResult {
  /** Base64-encoded signature bytes. */
  signature: string;
  /** Identifies which signing key/certificate produced this signature — stored alongside the entry so verify() knows which public key to check against. */
  keyId: string;
  algorithm: string;
}

/**
 * Signs (and verifies) the canonical bytes of an audit event envelope with
 * the writing party's NASH-issued key — or the platform's own NASH
 * organisation certificate for platform-generated events — *before* the
 * entry is written to immudb. See
 * claude/audit-log-architecture-decision.md, "What still has to be built on
 * top" item 1: immudb's own proof shows the entry hasn't been tampered with
 * *since it was written*; the NASH signature shows *who actually asserted
 * it*. Both properties are required, neither substitutes for the other.
 *
 * Pluggable so the real NASH/HSM-backed implementation can be swapped in
 * without touching call sites — see mock-nash.signer.ts for the current
 * (mock) implementation and signing.module.ts for the DI wiring.
 */
export interface Signer {
  sign(canonicalPayload: string): Promise<SignResult>;
  verify(canonicalPayload: string, signature: string, keyId: string): Promise<boolean>;
}
