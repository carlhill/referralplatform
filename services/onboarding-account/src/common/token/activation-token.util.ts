import { createHash, randomBytes } from 'node:crypto';

/**
 * The single-use activation link token — generated once, emailed once
 * (never logged or returned by any API response), and looked up by its hash
 * thereafter (`AccountActivationRequest.tokenHash`). SHA-256 is fine here
 * (not HMAC/bcrypt) because the token itself is 256 bits of CSPRNG entropy,
 * not a low-entropy user-chosen secret — hashing it is about not storing the
 * bearer-capable value verbatim, not about resisting offline guessing.
 */
export function generateActivationToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashActivationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
