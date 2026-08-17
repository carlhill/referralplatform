import { TokenVerifier } from '@referralplatform/auth-client';
import type { ConfigService } from '@nestjs/config';

/**
 * Unlike every other service, the Audit Log Service does not depend on
 * packages/audit-client — it's the service that client calls, not a caller of
 * it. It still verifies incoming service-to-service tokens (every write must
 * be authenticated as the calling service) via packages/auth-client — see
 * src/auth/bearer-auth.guard.ts for the actual Nest Guard wiring (this
 * function is kept as the reference factory other services' clients.ts
 * files copy). See root CONVENTIONS.md ("Using packages/auth-client") and
 * claude/audit-log-architecture-decision.md for the rest of what's built on
 * top of immudb here: NASH-backed signing before write
 * (src/signing/mock-nash.signer.ts — MOCK), crypto-shredding integration
 * (src/crypto-shredding/mock-local.kms.ts — MOCK), the versioned audit event
 * schema (packages/shared-types/src/audit-event.ts), and the
 * verification/query API (src/audit-events/).
 */
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
