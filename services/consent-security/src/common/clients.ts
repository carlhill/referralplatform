import { AuditClient } from '@referralplatform/audit-client';
import { ServiceTokenProvider, TokenVerifier } from '@referralplatform/auth-client';
import type { ConfigService } from '@nestjs/config';

/**
 * Reference wiring for packages/audit-client and packages/auth-client — see root
 * CONVENTIONS.md ("Using packages/audit-client" and "Using packages/auth-client").
 * Not wired into AppModule's providers by default (a skeleton service shouldn't
 * make network calls to Keycloak/Audit Log at boot before it has real business
 * logic that needs them) — copy this into a real provider once this service
 * starts performing clinical/consent-relevant writes.
 *
 * Example, once needed:
 *
 * ```ts
 * // app.module.ts
 * providers: [
 *   { provide: AuditClient, useFactory: (config: ConfigService) => createAuditClient(config), inject: [ConfigService] },
 * ],
 * ```
 */
export function createServiceTokenProvider(config: ConfigService): ServiceTokenProvider {
  return new ServiceTokenProvider({
    issuer: config.getOrThrow<string>('KEYCLOAK_ISSUER'),
    clientId: config.getOrThrow<string>('KEYCLOAK_CLIENT_ID'),
    clientSecret: config.getOrThrow<string>('KEYCLOAK_CLIENT_SECRET'),
  });
}

export function createAuditClient(config: ConfigService): AuditClient {
  const tokens = createServiceTokenProvider(config);
  return new AuditClient({
    baseUrl: config.getOrThrow<string>('AUDIT_LOG_SERVICE_URL'),
    getServiceToken: () => tokens.getToken(),
  });
}

export function createTokenVerifier(config: ConfigService): TokenVerifier {
  // KEYCLOAK_ISSUER is the Docker-internal URL this service *reaches* Keycloak on
  // (JWKS, token endpoint, admin API) — it is NOT what tokens carry as `iss`.
  // Keycloak stamps its configured public hostname (KC_HOSTNAME) into `iss`, so a
  // token minted for a browser at localhost:20004 carries that, not keycloak:8080.
  // jose compares issuers by exact string, so validating against the internal URL
  // rejected every browser-originated call with 401 while service-to-service calls
  // (minted inside the Docker network) kept working — which is why health checks
  // and server-side golden-path tests never caught it. See
  // BUILD_LOG/local-build-fixes.md, "Keycloak issuer mismatch".
  // Falls back to the internal URL when KEYCLOAK_PUBLIC_ISSUER is unset (unit tests).
  const internal = config.getOrThrow<string>('KEYCLOAK_ISSUER');
  return new TokenVerifier({
    issuer: config.get<string>('KEYCLOAK_PUBLIC_ISSUER') ?? internal,
    jwksUri: `${internal}/protocol/openid-connect/certs`,
    audience: config.get<string>('KEYCLOAK_CLIENT_ID'),
  });
}
