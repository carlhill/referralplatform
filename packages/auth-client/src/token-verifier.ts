import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { PrincipalType } from './principal';

export interface TokenVerifierConfig {
  /** Keycloak realm issuer URL, e.g. http://keycloak:8080/realms/referralplatform (see docker-compose.yml). */
  issuer: string;
  /** Expected `aud` claim — typically the calling service's own client id. */
  audience?: string;
  /** Override the JWKS URI; defaults to `${issuer}/protocol/openid-connect/certs` (standard Keycloak layout). */
  jwksUri?: string;
  /** Clock skew tolerance in seconds. */
  clockToleranceSeconds?: number;
}

export interface AuthenticatedPrincipal {
  /** Keycloak subject id. */
  sub: string;
  principalType: PrincipalType;
  /** Realm + client roles flattened into one list, per Keycloak's realm_access/resource_access claims. */
  roles: string[];
  /** IHI/HPI-O/HPI-I, carried as a custom claim set by the Identity & Access Service's token mapper. */
  healthcareIdentifier?: string;
  preferredUsername?: string;
  raw: JWTPayload;
}

/**
 * Verifies a Keycloak-issued OIDC access token (RS256, JWKS-based) for both
 * user-facing auth (patient/carer/GP/specialist/staff) and service-to-service
 * client-credentials tokens. See root CONVENTIONS.md ("Using packages/auth-client").
 */
export class TokenVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: TokenVerifierConfig) {
    const jwksUri = config.jwksUri ?? `${config.issuer}/protocol/openid-connect/certs`;
    this.jwks = createRemoteJWKSet(new URL(jwksUri));
  }

  async verify(token: string): Promise<AuthenticatedPrincipal> {
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.config.issuer,
      audience: this.config.audience,
      clockTolerance: this.config.clockToleranceSeconds ?? 10,
    });

    const realmRoles = ((payload as any).realm_access?.roles ?? []) as string[];
    const resourceAccess = ((payload as any).resource_access ?? {}) as Record<string, { roles?: string[] }>;
    const clientRoles = Object.values(resourceAccess).flatMap((r) => r.roles ?? []);

    return {
      sub: payload.sub as string,
      principalType: ((payload as any).principal_type as PrincipalType) ?? 'system',
      roles: [...realmRoles, ...clientRoles],
      healthcareIdentifier: (payload as any).healthcare_identifier as string | undefined,
      preferredUsername: (payload as any).preferred_username as string | undefined,
      raw: payload,
    };
  }
}
