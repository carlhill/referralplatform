import { decodeJwtPayload } from './oidc';

function fakeJwt(payload: Record<string, unknown>): string {
  const base64url = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url(payload)}.fake-signature`;
}

describe('decodeJwtPayload', () => {
  it('extracts sub, principalType, and healthcareIdentifier claims', () => {
    const token = fakeJwt({
      sub: 'specialist-abc-123',
      principal_type: 'specialist',
      healthcare_identifier: '8003610000001234',
      preferred_username: 'dr.smith',
    });

    const principal = decodeJwtPayload(token);

    expect(principal).toMatchObject({
      sub: 'specialist-abc-123',
      principalType: 'specialist',
      healthcareIdentifier: '8003610000001234',
      preferredUsername: 'dr.smith',
    });
  });

  it('flattens realm and client roles into one list', () => {
    const token = fakeJwt({
      sub: 'u1',
      realm_access: { roles: ['offline_access'] },
      resource_access: { 'specialist-portal': { roles: ['specialist'] } },
    });

    const principal = decodeJwtPayload(token);

    expect(principal?.roles.sort()).toEqual(['offline_access', 'specialist'].sort());
  });

  it('defaults principalType to specialist when the claim is absent', () => {
    const token = fakeJwt({ sub: 'u1' });
    expect(decodeJwtPayload(token)?.principalType).toBe('specialist');
  });

  it('returns null for a malformed token', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
  });
});
