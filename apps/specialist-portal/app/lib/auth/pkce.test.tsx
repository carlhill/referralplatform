import { webcrypto } from 'crypto';
import { TextEncoder as NodeTextEncoder } from 'util';

// jsdom (this project's jest-environment-jsdom, v20) doesn't implement
// SubtleCrypto or TextEncoder — polyfill both with Node's own
// implementations before importing the module under test, which calls
// `crypto.subtle.digest` and `new TextEncoder()`.
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
if (typeof globalThis.TextEncoder === 'undefined') {
  (globalThis as unknown as { TextEncoder: unknown }).TextEncoder = NodeTextEncoder;
}

import { generateCodeChallenge, generateRandomString } from './pkce';

describe('generateRandomString', () => {
  it('produces a URL-safe string of the requested length', () => {
    const value = generateRandomString(64);
    expect(value).toHaveLength(64);
    expect(value).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('produces different values on each call', () => {
    expect(generateRandomString(32)).not.toBe(generateRandomString(32));
  });
});

describe('generateCodeChallenge', () => {
  it('computes the RFC 7636 example S256 challenge for a known verifier', async () => {
    // The exact verifier/challenge pair from RFC 7636 Appendix B.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await generateCodeChallenge(verifier);
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('is deterministic for the same input', async () => {
    const a = await generateCodeChallenge('some-verifier-value');
    const b = await generateCodeChallenge('some-verifier-value');
    expect(a).toBe(b);
  });

  it('never contains base64 padding or unsafe characters', async () => {
    const challenge = await generateCodeChallenge(generateRandomString(64));
    expect(challenge).not.toMatch(/[+/=]/);
  });
});
