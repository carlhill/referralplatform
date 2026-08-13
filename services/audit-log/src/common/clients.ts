import { TokenVerifier } from '@referralplatform/auth-client';
import type { ConfigService } from '@nestjs/config';

/**
 * Unlike every other service, the Audit Log Service does not depend on
 * packages/audit-client — it's the service that client calls, not a caller of
 * it. It still verifies incoming service-to-service tokens (every write must
 * be authenticated as the calling service) via packages/auth-client. See root
 * CONVENTIONS.md ("Using packages/auth-client") and
 * claude/audit-log-architecture-decision.md for what this service still needs
 * to build on top of immudb: NASH-backed signing before write, crypto-shredding
 * integration, the versioned audit event schema (see
 * packages/shared-types/src/audit-event.ts), and the verification/query API.
 */
export function createTokenVerifier(config: ConfigService): TokenVerifier {
  return new TokenVerifier({
    issuer: config.getOrThrow<string>('KEYCLOAK_ISSUER'),
    audience: config.get<string>('KEYCLOAK_CLIENT_ID'),
  });
}
