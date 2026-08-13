/**
 * Backend service base URLs. docker-compose.yml does not yet wire every
 * NEXT_PUBLIC_* var this app needs into the `patient-web` service's
 * `environment:` block (same documented gap gp-portal's config.ts flags —
 * editing docker-compose.yml is scaffold-phase-owned, out of this app's
 * scope), so every URL below falls back to the fixed local-dev port each
 * service is documented to run on in root CONVENTIONS.md §1. Override via
 * `.env.local` (see `.env.example`) if your local stack differs.
 */
function url(envVar: string | undefined, fallbackPort: number): string {
  return envVar && envVar.length > 0 ? envVar : `http://localhost:${fallbackPort}`;
}

export const config = {
  keycloakIssuer: process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER ?? 'http://localhost:8180/realms/referralplatform',
  keycloakClientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'patient-web',
  appBaseUrl: process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'http://localhost:3102',

  identityAccessUrl: url(process.env.NEXT_PUBLIC_IDENTITY_ACCESS_URL, 3001),
  onboardingAccountUrl: url(process.env.NEXT_PUBLIC_ONBOARDING_ACCOUNT_URL, 3002),
  gpAuthorisationUrl: url(process.env.NEXT_PUBLIC_GP_AUTHORISATION_URL, 3003),
  consentSecurityUrl: url(process.env.NEXT_PUBLIC_CONSENT_SECURITY_URL, 3004),
  referralUrl: url(process.env.NEXT_PUBLIC_REFERRAL_SERVICE_URL, 3005),
  directoryUrl: url(process.env.NEXT_PUBLIC_DIRECTORY_SERVICE_URL, 3006),
  bookingUrl: url(process.env.NEXT_PUBLIC_BOOKING_SERVICE_URL, 3007),
  followUpRecallUrl: url(process.env.NEXT_PUBLIC_FOLLOWUP_RECALL_URL, 3009),
  notificationUrl: url(process.env.NEXT_PUBLIC_NOTIFICATION_SERVICE_URL, 3010),
};
