/**
 * Backend service base URLs, read from EXPO_PUBLIC_* env vars (inlined at
 * build time — see root CONVENTIONS.md §10). docker-compose.yml does not
 * wire every one of these into a `patient-mobile` service (there isn't one
 * — this app ships as a native/Expo Go build, not a docker-compose
 * container), so every URL below falls back to the fixed local-dev port
 * each service is documented to run on in root CONVENTIONS.md §1.
 *
 * NOTE for physical-device testing: `localhost` resolves to the device
 * itself, not your dev machine — override every EXPO_PUBLIC_*_URL in `.env`
 * with your machine's LAN IP (e.g. `http://192.168.1.23:3002`) when running
 * on Expo Go on a real phone rather than a simulator.
 */
function url(envVar: string | undefined, fallbackPort: number): string {
  return envVar && envVar.length > 0 ? envVar : `http://localhost:${fallbackPort}`;
}

export const config = {
  keycloakIssuer: process.env.EXPO_PUBLIC_KEYCLOAK_ISSUER ?? 'http://localhost:8180/realms/referralplatform',
  keycloakClientId: process.env.EXPO_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'patient-mobile',

  identityAccessUrl: url(process.env.EXPO_PUBLIC_IDENTITY_ACCESS_URL, 3001),
  onboardingAccountUrl: url(process.env.EXPO_PUBLIC_ONBOARDING_ACCOUNT_SERVICE_URL, 3002),
  gpAuthorisationUrl: url(process.env.EXPO_PUBLIC_GP_AUTHORISATION_URL, 3003),
  consentSecurityUrl: url(process.env.EXPO_PUBLIC_CONSENT_SECURITY_URL, 3004),
  referralUrl: url(process.env.EXPO_PUBLIC_REFERRAL_SERVICE_URL, 3005),
  directoryUrl: url(process.env.EXPO_PUBLIC_DIRECTORY_SERVICE_URL, 3006),
  bookingUrl: url(process.env.EXPO_PUBLIC_BOOKING_SERVICE_URL, 3007),
  notificationUrl: url(process.env.EXPO_PUBLIC_NOTIFICATION_SERVICE_URL, 3010),
};
