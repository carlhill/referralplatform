export interface ServiceTokenConfig {
  /** e.g. http://keycloak:8080/realms/referralplatform */
  issuer: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Client-credentials grant helper for service-to-service calls (e.g. a service
 * calling packages/audit-client, which needs a bearer token identifying *which
 * service* is writing the audit entry). Caches the token in-memory until shortly
 * before expiry.
 *
 * Usage: one `ServiceTokenProvider` per calling service, constructed once at
 * startup from `KEYCLOAK_ISSUER` / `KEYCLOAK_CLIENT_ID` / `KEYCLOAK_CLIENT_SECRET`
 * env vars (see root CONVENTIONS.md, "Environment variable conventions").
 */
export class ServiceTokenProvider {
  private cached?: CachedToken;

  constructor(private readonly config: ServiceTokenConfig) {}

  async getToken(): Promise<string> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt - 10_000 > now) {
      return this.cached.accessToken;
    }
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const res = await fetchImpl(`${this.config.issuer}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });
    if (!res.ok) {
      throw new Error(`Failed to obtain service token from Keycloak: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.cached = { accessToken: body.access_token, expiresAt: now + body.expires_in * 1000 };
    return this.cached.accessToken;
  }
}
