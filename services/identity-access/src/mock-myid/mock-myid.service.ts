import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, exportJWK, generateKeyPair, type KeyLike } from 'jose';

/**
 * MOCK — replace with real integration.
 *
 * This is a self-contained, in-process mock OIDC identity provider standing
 * in for myID (Australia's TDIF-accredited Digital ID), since this build has
 * no real TDIF-accredited credential to integrate against (see
 * claude/solution-architecture-tech-stack.md, "Identity and access" —
 * "Keycloak can be configured as an OIDC relying party against a
 * TDIF-accredited identity provider, which is exactly the 'lightweight path'
 * already recommended over seeking TDIF accreditation directly"). Keycloak
 * (configured as the OIDC relying party — see the `myid` identityProvider in
 * infra/keycloak/realm-export.json) talks to *this* mock IdP over the exact
 * same OIDC authorization-code protocol it would use against the real thing,
 * so the relying-party wiring on the Keycloak side can be built and tested
 * end to end today, and swapped to the real myID issuer/client
 * credentials/JWKS URL later purely as configuration — no code change here
 * or in Keycloak's client config shape.
 *
 * Session state (issued authorization codes, access tokens) is held
 * in-memory, not in Postgres — acceptable *only* because this is a
 * throwaway local-dev/test stand-in for an external system, not a durable
 * business record; a restart simply invalidates any in-flight mock myID
 * login, which is fine for its purpose.
 */
@Injectable()
export class MockMyIdService {
  private readonly keysReady: Promise<{ privateKey: KeyLike; publicKey: KeyLike }>;
  private readonly kid = 'mock-myid-2026-08';
  private readonly authCodes = new Map<
    string,
    { clientId: string; redirectUri: string; nonce?: string; subject: MockMyIdClaims; expiresAt: number }
  >();
  private readonly accessTokens = new Map<string, { claims: MockMyIdClaims; expiresAt: number }>();

  constructor(private readonly config: ConfigService) {
    this.keysReady = generateKeyPair('RS256', { extractable: true }).then(({ privateKey, publicKey }) => ({
      privateKey,
      publicKey,
    }));
  }

  private issuerBaseUrl(): string {
    return this.config.get<string>('MOCK_MYID_ISSUER_BASE_URL', 'http://localhost:3001/mock-myid');
  }

  discoveryDocument(): Record<string, unknown> {
    const base = this.issuerBaseUrl();
    return {
      issuer: base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      userinfo_endpoint: `${base}/userinfo`,
      jwks_uri: `${base}/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'profile', 'email'],
      claims_supported: ['sub', 'given_name', 'family_name', 'birthdate', 'email', 'identity_proofing_level'],
    };
  }

  async jwks(): Promise<{ keys: Record<string, unknown>[] }> {
    const { publicKey } = await this.keysReady;
    const jwk = await exportJWK(publicKey);
    return { keys: [{ ...jwk, kid: this.kid, use: 'sig', alg: 'RS256' }] };
  }

  /**
   * Validates the authorization request and mints a short-lived, single-use
   * authorization code — mirrors a real OIDC IdP's `/authorize` endpoint
   * minus the actual interactive login/consent screen (MOCK: auto-approves
   * with a canned or `login_hint`-derived identity, since no real user
   * exists to authenticate against a stub IdP).
   */
  createAuthorizationCode(params: {
    clientId: string;
    redirectUri: string;
    responseType: string;
    state?: string;
    nonce?: string;
    loginHint?: string;
  }): { code: string; state?: string } {
    const expectedClientId = this.config.get<string>('MOCK_MYID_CLIENT_ID', 'referralplatform-myid-stub');
    if (params.clientId !== expectedClientId) {
      throw new BadRequestException('Unknown client_id for mock myID IdP');
    }
    if (params.responseType !== 'code') {
      throw new BadRequestException('Only response_type=code is supported by the mock myID IdP');
    }

    const subject = mockSubjectFor(params.loginHint);
    const code = randomBytes(24).toString('base64url');
    this.authCodes.set(code, {
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      nonce: params.nonce,
      subject,
      expiresAt: Date.now() + 60_000, // authorization codes are short-lived by design
    });
    return { code, state: params.state };
  }

  async exchangeCodeForTokens(params: {
    grantType: string;
    code: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
  }): Promise<{ access_token: string; id_token: string; token_type: 'Bearer'; expires_in: number }> {
    const expectedClientId = this.config.get<string>('MOCK_MYID_CLIENT_ID', 'referralplatform-myid-stub');
    const expectedClientSecret = this.config.get<string>('MOCK_MYID_CLIENT_SECRET', 'change-me-in-local-env');

    if (params.grantType !== 'authorization_code') {
      throw new BadRequestException('Only grant_type=authorization_code is supported by the mock myID IdP');
    }
    if (params.clientId !== expectedClientId || params.clientSecret !== expectedClientSecret) {
      throw new UnauthorizedException('Invalid client credentials for mock myID IdP');
    }

    const entry = this.authCodes.get(params.code);
    if (!entry || entry.expiresAt < Date.now()) {
      throw new BadRequestException('Unknown or expired authorization code');
    }
    if (entry.clientId !== params.clientId || entry.redirectUri !== params.redirectUri) {
      throw new BadRequestException('client_id/redirect_uri mismatch for this authorization code');
    }
    this.authCodes.delete(params.code); // single-use

    const { privateKey } = await this.keysReady;
    const base = this.issuerBaseUrl();
    const idToken = await new SignJWT({
      ...entry.subject,
      nonce: entry.nonce,
    })
      .setProtectedHeader({ alg: 'RS256', kid: this.kid })
      .setIssuer(base)
      .setAudience(params.clientId)
      .setSubject(entry.subject.sub)
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(privateKey);

    const accessToken = randomBytes(32).toString('base64url');
    this.accessTokens.set(accessToken, { claims: entry.subject, expiresAt: Date.now() + 10 * 60_000 });

    return { access_token: accessToken, id_token: idToken, token_type: 'Bearer', expires_in: 600 };
  }

  userinfo(accessToken: string): MockMyIdClaims {
    const entry = this.accessTokens.get(accessToken);
    if (!entry || entry.expiresAt < Date.now()) {
      throw new UnauthorizedException('Invalid or expired mock myID access token');
    }
    return entry.claims;
  }
}

export interface MockMyIdClaims {
  sub: string;
  given_name: string;
  family_name: string;
  birthdate: string;
  email: string;
  /** MOCK — stands in for the real proofing-level claim a TDIF-accredited myID assertion would carry (IP1/IP2/IP3). */
  identity_proofing_level: 'IP1' | 'IP2' | 'IP3';
}

/** Canned mock identity — a real IdP integration replaces this whole function with an actual login/consent UI. */
function mockSubjectFor(loginHint?: string): MockMyIdClaims {
  const suffix = loginHint ? loginHint.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'default' : 'default';
  return {
    sub: `myid-mock-subject-${suffix}`,
    given_name: 'Jordan',
    family_name: 'Citizen',
    birthdate: '1990-01-01',
    email: loginHint && loginHint.includes('@') ? loginHint : 'jordan.citizen@example.com',
    identity_proofing_level: 'IP2',
  };
}
