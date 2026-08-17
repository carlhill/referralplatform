import { SERVICE_URLS, decodeJwt, requireStack, serviceToken, ISSUER } from '../src/stack';

/**
 * REGRESSION: the Keycloak issuer mismatch (2026-08-17).
 *
 * Keycloak had no `KC_HOSTNAME`, so it built the `iss` claim from whichever host the
 * token request arrived on. Tokens minted over the host-published port carried
 * `iss=http://localhost:20004/...` while every backend validated
 * `iss=http://keycloak:8080/...`, and `jose` compares issuers by exact string — so
 * **every browser-originated call to every service returned 401**, while
 * service-to-service calls (minted inside the Docker network) kept working.
 *
 * That asymmetry is exactly why it survived: health checks passed, unit tests passed,
 * and the golden-path testing that fetched tokens server-side passed. Only a request
 * that takes the browser's path can catch it, which is what this file does.
 */
describe('Keycloak issuer contract (browser path)', () => {
  beforeAll(requireStack);

  it('stamps one stable issuer regardless of which host the token was requested from', async () => {
    const token = await serviceToken('referral-service');
    expect(decodeJwt(token).iss).toBe(ISSUER);
  });

  it('includes every backend in the audience, so cross-service calls can be authorised', async () => {
    // Without the shared `backend-services-audience` scope, `aud` is just ["account"]
    // and each service rejects the token as not intended for it.
    const aud = decodeJwt(await serviceToken('referral-service')).aud as string[];
    expect(aud).toEqual(expect.arrayContaining(['referral-service', 'audit-log-service']));
  });

  it('is ACCEPTED by a backend service — the call that used to 401', async () => {
    const token = await serviceToken('referral-service');
    const res = await fetch(`${SERVICE_URLS.referral}/referrals?gpId=integration-probe`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // 200 (or at worst a 4xx that is *not* 401) proves the token was accepted. A 401
    // here means the issuer/audience contract has regressed.
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
  });

  it('rejects an unauthenticated call, so the 200 above is not just an open endpoint', async () => {
    const res = await fetch(`${SERVICE_URLS.referral}/referrals?gpId=integration-probe`);
    expect(res.status).toBe(401);
  });
});
