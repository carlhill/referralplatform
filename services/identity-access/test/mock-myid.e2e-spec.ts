import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { importJWK, jwtVerify } from 'jose';
import { MockMyIdModule } from '../src/mock-myid/mock-myid.module';

/**
 * Boots only MockMyIdModule (not the full AppModule) — this mock IdP has no
 * database or Keycloak dependency, so this suite deliberately doesn't require
 * `docker compose up` first, unlike test/health.e2e-spec.ts which exercises
 * the full app (including Prisma) and does need the local stack running —
 * see README.md.
 *
 * Exercises the real HTTP surface Keycloak would hit as an OIDC relying
 * party: discovery -> authorize -> token -> jwks-verified id_token ->
 * userinfo. MOCK — replace with real integration (see mock-myid.service.ts).
 */
describe('Mock myID IdP (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.MOCK_MYID_CLIENT_ID = 'referralplatform-myid-stub';
    process.env.MOCK_MYID_CLIENT_SECRET = 'change-me-in-local-env';
    process.env.MOCK_MYID_ISSUER_BASE_URL = 'http://localhost:3001/mock-myid';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), MockMyIdModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves an OIDC discovery document', async () => {
    const res = await request(app.getHttpServer()).get('/mock-myid/.well-known/openid-configuration');
    expect(res.status).toBe(200);
    expect(res.body.issuer).toBe('http://localhost:3001/mock-myid');
    expect(res.body.token_endpoint).toBe('http://localhost:3001/mock-myid/token');
  });

  it('completes the full authorization_code flow over real HTTP', async () => {
    const authorizeRes = await request(app.getHttpServer()).get('/mock-myid/authorize').query({
      client_id: 'referralplatform-myid-stub',
      redirect_uri: 'http://keycloak:8080/realms/referralplatform/broker/myid/endpoint',
      response_type: 'code',
      state: 'state-123',
      nonce: 'nonce-123',
      login_hint: 'e2e-carer@example.com',
    });

    expect(authorizeRes.status).toBe(302);
    const redirectUrl = new URL(authorizeRes.headers.location);
    expect(redirectUrl.origin + redirectUrl.pathname).toBe(
      'http://keycloak:8080/realms/referralplatform/broker/myid/endpoint',
    );
    const code = redirectUrl.searchParams.get('code');
    expect(redirectUrl.searchParams.get('state')).toBe('state-123');
    expect(code).toBeTruthy();

    const tokenRes = await request(app.getHttpServer()).post('/mock-myid/token').type('form').send({
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'http://keycloak:8080/realms/referralplatform/broker/myid/endpoint',
      client_id: 'referralplatform-myid-stub',
      client_secret: 'change-me-in-local-env',
    });

    expect(tokenRes.status).toBe(201); // Nest's default POST success status
    expect(tokenRes.body.token_type).toBe('Bearer');
    expect(tokenRes.body.id_token).toEqual(expect.any(String));

    const jwksRes = await request(app.getHttpServer()).get('/mock-myid/jwks');
    const publicKey = await importJWK(jwksRes.body.keys[0], 'RS256');
    const { payload } = await jwtVerify(tokenRes.body.id_token, publicKey, {
      issuer: 'http://localhost:3001/mock-myid',
      audience: 'referralplatform-myid-stub',
    });
    expect(payload.nonce).toBe('nonce-123');
    expect(payload.email).toBe('e2e-carer@example.com');

    const userinfoRes = await request(app.getHttpServer())
      .get('/mock-myid/userinfo')
      .set('Authorization', `Bearer ${tokenRes.body.access_token}`);
    expect(userinfoRes.status).toBe(200);
    expect(userinfoRes.body.email).toBe('e2e-carer@example.com');
  });

  it('rejects userinfo without a bearer token', async () => {
    const res = await request(app.getHttpServer()).get('/mock-myid/userinfo');
    expect(res.status).toBe(401);
  });
});
