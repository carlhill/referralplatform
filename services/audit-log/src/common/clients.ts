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
  return new TokenVerifier({
    issuer: config.getOrThrow<string>('KEYCLOAK_ISSUER'),
    audience: config.get<string>('KEYCLOAK_CLIENT_ID'),
  });
}
