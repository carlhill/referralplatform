import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, importJWK } from 'jose';
import { MockMyIdService } from './mock-myid.service';

function makeConfig(): ConfigService {
  const values: Record<string, string> = {
    MOCK_MYID_ISSUER_BASE_URL: 'http://localhost:3001/mock-myid',
    MOCK_MYID_CLIENT_ID: 'referralplatform-myid-stub',
    MOCK_MYID_CLIENT_SECRET: 'change-me-in-local-env',
  };
  return { get: (key: string, fallback?: string) => values[key] ?? fallback } as unknown as ConfigService;
}

describe('MockMyIdService', () => {
  it('exposes a discovery document pointing at its own endpoints', () => {
    const service = new MockMyIdService(makeConfig());
    const doc = service.discoveryDocument();
    expect(doc.issuer).toBe('http://localhost:3001/mock-myid');
    expect(doc.authorization_endpoint).toBe('http://localhost:3001/mock-myid/authorize');
    expect(doc.token_endpoint).toBe('http://localhost:3001/mock-myid/token');
  });

  it('rejects an authorization request from an unknown client_id', () => {
    const service = new MockMyIdService(makeConfig());
    expect(() =>
      service.createAuthorizationCode({
        clientId: 'someone-else',
        redirectUri: 'http://keycloak:8080/cb',
        responseType: 'code',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects an unsupported response_type', () => {
    const service = new MockMyIdService(makeConfig());
    expect(() =>
      service.createAuthorizationCode({
        clientId: 'referralplatform-myid-stub',
        redirectUri: 'http://keycloak:8080/cb',
        responseType: 'token',
      }),
    ).toThrow(BadRequestException);
  });

  it('completes a full authorization_code -> id_token -> userinfo round trip with a real, verifiable JWT', async () => {
    const service = new MockMyIdService(makeConfig());

    const { code, state } = service.createAuthorizationCode({
      clientId: 'referralplatform-myid-stub',
      redirectUri: 'http://keycloak:8080/realms/referralplatform/broker/myid/endpoint',
      responseType: 'code',
      state: 'xyz',
      nonce: 'nonce-abc',
      loginHint: 'carer@example.com',
    });
    expect(code).toEqual(expect.any(String));
    expect(state).toBe('xyz');

    const tokens = await service.exchangeCodeForTokens({
      grantType: 'authorization_code',
      code,
      redirectUri: 'http://keycloak:8080/realms/referralplatform/broker/myid/endpoint',
      clientId: 'referralplatform-myid-stub',
      clientSecret: 'change-me-in-local-env',
    });
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.access_token).toEqual(expect.any(String));

    // The authorization code must be single-use.
    await expect(
      service.exchangeCodeForTokens({
        grantType: 'authorization_code',
        code,
        redirectUri: 'http://keycloak:8080/realms/referralplatform/broker/myid/endpoint',
        clientId: 'referralplatform-myid-stub',
        clientSecret: 'change-me-in-local-env',
      }),
    ).rejects.toThrow(BadRequestException);

    // The id_token must be a real, independently verifiable JWT against the service's own published JWKS.
    const { keys } = await service.jwks();
    const publicKey = await importJWK(keys[0] as any, 'RS256');
    const { payload } = await jwtVerify(tokens.id_token, publicKey, {
      issuer: 'http://localhost:3001/mock-myid',
      audience: 'referralplatform-myid-stub',
    });
    expect(payload.nonce).toBe('nonce-abc');
    expect(payload.given_name).toBe('Jordan');
    expect(payload.email).toBe('carer@example.com');
    expect(payload.identity_proofing_level).toBe('IP2');

    const claims = service.userinfo(tokens.access_token);
    expect(claims.email).toBe('carer@example.com');
  });

  it('rejects wrong client credentials at the token endpoint', async () => {
    const service = new MockMyIdService(makeConfig());
    const { code } = service.createAuthorizationCode({
      clientId: 'referralplatform-myid-stub',
      redirectUri: 'http://keycloak:8080/cb',
      responseType: 'code',
    });
    await expect(
      service.exchangeCodeForTokens({
        grantType: 'authorization_code',
        code,
        redirectUri: 'http://keycloak:8080/cb',
        clientId: 'referralplatform-myid-stub',
        clientSecret: 'wrong-secret',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown access token at userinfo', () => {
    const service = new MockMyIdService(makeConfig());
    expect(() => service.userinfo('not-a-real-token')).toThrow(UnauthorizedException);
  });
});
