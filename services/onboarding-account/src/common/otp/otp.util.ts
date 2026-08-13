import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Generates a 6-digit OTP code — see modules-and-requirements.md ("bumped up
 * from the original 4-digit SMS spec, since email is a lower-assurance
 * channel with no SIM-possession guarantee").
 */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * The raw code is never persisted — only this HMAC-SHA256 digest (keyed with
 * OTP_HASH_SECRET) is stored, so a database read alone can never recover a
 * usable code.
 */
export function hashOtpCode(code: string, secret: string): string {
  return createHmac('sha256', secret).update(code).digest('hex');
}

/** Constant-time comparison — never use `===` on secret-derived hashes. */
export function verifyOtpCode(code: string, expectedHash: string, secret: string): boolean {
  const actualHash = hashOtpCode(code, secret);
  const a = Buffer.from(actualHash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
