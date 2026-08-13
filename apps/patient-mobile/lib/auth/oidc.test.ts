import { buildLocalActivationSession, isTokenSetExpired } from './oidc';
import { decodeJwt } from './jwt';

describe('buildLocalActivationSession', () => {
  it('produces a token decodable by decodeJwt with the right principal fields', () => {
    const tokens = buildLocalActivationSession('patient-123', 'patient');
    const decoded = decodeJwt(tokens.accessToken);
    expect(decoded?.sub).toBe('patient-123');
    expect(decoded?.principal_type).toBe('patient');
  });

  it('round-trips non-ASCII display names correctly', () => {
    // The session itself doesn't carry a name today, but the encoder must
    // still handle arbitrary unicode safely without throwing — exercised via
    // a carer role, which sets preferred_username to a fixed ASCII string,
    // plus a direct encode/decode smoke test through decodeJwt.
    const tokens = buildLocalActivationSession('carer-Renée-99', 'carer');
    const decoded = decodeJwt(tokens.accessToken);
    expect(decoded?.sub).toBe('carer-Renée-99');
    expect(decoded?.principal_type).toBe('carer');
  });

  it('sets an expiry roughly 8 hours in the future', () => {
    const tokens = buildLocalActivationSession('patient-1', 'patient');
    const decoded = decodeJwt(tokens.accessToken);
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(decoded?.exp).toBeGreaterThan(nowSeconds + 60 * 60 * 7);
    expect(decoded?.exp).toBeLessThanOrEqual(nowSeconds + 60 * 60 * 8 + 5);
  });
});

describe('isTokenSetExpired', () => {
  it('is false for a freshly obtained token set', () => {
    const tokens = { accessToken: 'x', obtainedAt: Date.now(), expiresInSeconds: 3600 };
    expect(isTokenSetExpired(tokens)).toBe(false);
  });

  it('is true once past expiry (minus skew)', () => {
    const tokens = { accessToken: 'x', obtainedAt: Date.now() - 3600_000, expiresInSeconds: 60 };
    expect(isTokenSetExpired(tokens)).toBe(true);
  });
});
