import { decodeJwt, isExpired, rolesOf } from './jwt';

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
    const token = fakeToken({ sub: 'gp-1', principal_type: 'gp', exp: 9999999999 });
    const decoded = decodeJwt(token);
    expect(decoded?.sub).toBe('gp-1');
    expect(decoded?.principal_type).toBe('gp');
  });

  it('returns null for a malformed token', () => {
    expect(decodeJwt('not-a-jwt')).toBeNull();
    expect(decodeJwt('a.b')).toBeNull();
  });

  it('decodes non-ASCII display names correctly', () => {
    const token = fakeToken({ sub: 'gp-2', name: 'Dr Renée Dubois' });
    expect(decodeJwt(token)?.name).toBe('Dr Renée Dubois');
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

  it('applies the clock-skew tolerance', () => {
    const almostNow = Math.floor(Date.now() / 1000) + 10;
    expect(isExpired({ sub: 'x', exp: almostNow }, 30)).toBe(true);
  });
});

describe('rolesOf', () => {
  it('flattens realm and client roles', () => {
    const decoded = {
      sub: 'gp-1',
      realm_access: { roles: ['gp'] },
      resource_access: { 'gp-portal': { roles: ['practice-admin'] } },
    };
    expect(rolesOf(decoded)).toEqual(['gp', 'practice-admin']);
  });

  it('returns an empty array for a null token', () => {
    expect(rolesOf(null)).toEqual([]);
  });
});
