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
  return new TokenVerifier({
    issuer: config.getOrThrow<string>('KEYCLOAK_ISSUER'),
    audience: config.get<string>('KEYCLOAK_CLIENT_ID'),
  });
}
