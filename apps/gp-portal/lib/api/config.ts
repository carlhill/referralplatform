/**
 * Backend service base URLs. `docker-compose.yml`'s `gp-portal` service only
 * currently injects `NEXT_PUBLIC_IDENTITY_ACCESS_URL`, `NEXT_PUBLIC_REFERRAL_SERVICE_URL`,
 * and `NEXT_PUBLIC_KEYCLOAK_ISSUER` (see that file's `depends_on` list for gp-portal,
 * which is missing gp-authorisation/directory/followup-recall/notification/
 * consent-security/onboarding-account even though this app calls all of them) —
 * editing docker-compose.yml is outside this app's scope (root CONVENTIONS.md
 * assigns it to the scaffold phase), so every URL below falls back to the fixed
 * local-dev port each service is documented to run on in root CONVENTIONS.md §1 /
 * docker-compose.yml's port-map comment. Override any of these via `.env.local`
 * (see `.env.example`) if your local stack maps ports differently.
 */
function url(envVar: string | undefined, fallbackPort: number): string {
  return envVar && envVar.length > 0 ? envVar : `http://localhost:${fallbackPort}`;
}

export const config = {
  keycloakIssuer:
    process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER ?? 'http://localhost:8180/realms/referralplatform',
  keycloakClientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'gp-portal',
  appBaseUrl: process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'http://localhost:3100',

  identityAccessUrl: url(process.env.NEXT_PUBLIC_IDENTITY_ACCESS_URL, 3001),
  onboardingAccountUrl: url(process.env.NEXT_PUBLIC_ONBOARDING_ACCOUNT_URL, 3002),
  gpAuthorisationUrl: url(process.env.NEXT_PUBLIC_GP_AUTHORISATION_URL, 3003),
  consentSecurityUrl: url(process.env.NEXT_PUBLIC_CONSENT_SECURITY_URL, 3004),
  referralUrl: url(process.env.NEXT_PUBLIC_REFERRAL_SERVICE_URL, 3005),
  directoryUrl: url(process.env.NEXT_PUBLIC_DIRECTORY_SERVICE_URL, 3006),
  followUpRecallUrl: url(process.env.NEXT_PUBLIC_FOLLOWUP_RECALL_URL, 3009),
  notificationUrl: url(process.env.NEXT_PUBLIC_NOTIFICATION_SERVICE_URL, 3010),
};
