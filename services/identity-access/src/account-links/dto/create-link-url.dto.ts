import { IsIn, IsString, Length } from 'class-validator';

/** Every public frontend client this realm currently defines — see infra/keycloak/realm-export.json. */
export const KNOWN_CLIENT_IDS = ['gp-portal', 'specialist-portal', 'patient-web', 'patient-mobile'] as const;
export type KnownClientId = (typeof KNOWN_CLIENT_IDS)[number];

export class CreateLinkUrlDto {
  @IsIn(KNOWN_CLIENT_IDS)
  clientId!: KnownClientId;

  /** Where Keycloak redirects back to after linking — validated server-side against ACCOUNT_LINK_ALLOWED_ORIGINS, not trusted as-is. */
  @IsString()
  @Length(1, 2048)
  redirectUri!: string;

  /**
   * The `sid` claim from the caller's Keycloak ID token — this service's own
   * bearer-token verification (via packages/auth-client's TokenVerifier)
   * checks the *access* token, which does not reliably carry `sid` in a
   * default Keycloak configuration, so the frontend (which already holds the
   * ID token from the OIDC code exchange) supplies it explicitly. See
   * account-links.service.ts for why this is required by Keycloak's Client
   * Initiated Account Linking hash computation.
   */
  @IsString()
  @Length(1, 512)
  sessionId!: string;
}
