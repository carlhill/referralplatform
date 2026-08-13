import { decodeJwt, hasStepUp, isExpired, rolesOf } from './jwt';

function base64Url(obj: unknown): string {
  const json = JSON.stringify(obj);
  return Buffer.from(json).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fakeToken(payload: Record<string, unknown>): string {
  const header = base64Url({ alg: 'RS256', typ: 'JWT' });
  const body = base64Url(payload);
  return `${header}.${body}.fake-signature`;
}

describe('decodeJwt', () => {
  it('decodes a well-formed JWT payload', () => {
    const token = fakeToken({ sub: 'patient-1', principal_type: 'patient', exp: 9999999999 });
    const decoded = decodeJwt(token);
    expect(decoded?.sub).toBe('patient-1');
    expect(decoded?.principal_type).toBe('patient');
  });

  it('returns null for a malformed token', () => {
    expect(decodeJwt('not-a-jwt')).toBeNull();
    expect(decodeJwt('a.b')).toBeNull();
  });
});

describe('isExpired', () => {
  it('treats a null decoded token as expired', () => {
    expect(isExpired(null)).toBe(true);
  });

  it('treats a future exp as not expired', () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    expect(isExpired({ sub: 'x', exp: future })).toBe(false);
  });

  it('treats a past exp as expired', () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    expect(isExpired({ sub: 'x', exp: past })).toBe(true);
  });
});

describe('rolesOf', () => {
  it('flattens realm and client roles', () => {
    const decoded = {
      sub: 'patient-1',
      realm_access: { roles: ['patient'] },
      resource_access: { 'patient-web': { roles: ['self-service'] } },
    };
    expect(rolesOf(decoded)).toEqual(['patient', 'self-service']);
  });

  it('returns an empty array for a null token', () => {
    expect(rolesOf(null)).toEqual([]);
  });
});

describe('hasStepUp', () => {
  it('is false for a null token', () => {
    expect(hasStepUp(null)).toBe(false);
  });

  it('is true when acr is passkey', () => {
    expect(hasStepUp({ sub: 'x', acr: 'passkey' })).toBe(true);
  });

  it('is true when amr includes webauthn', () => {
    expect(hasStepUp({ sub: 'x', amr: ['pwd', 'webauthn'] })).toBe(true);
  });

  it('is false for a plain password/OTP session', () => {
    expect(hasStepUp({ sub: 'x', acr: '1', amr: ['pwd', 'otp'] })).toBe(false);
  });
});
