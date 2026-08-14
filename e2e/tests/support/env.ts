/**
 * Service URLs — match the root docker-compose.yml's published (host) ports
 * exactly, since everything in this suite runs from outside the compose
 * network (a real browser, plus Playwright's own `request` context) just
 * like a human developer's browser would. See docker-compose.yml's header
 * comment for the authoritative port map.
 */
export const urls = {
  keycloakIssuer: 'http://localhost:8180/realms/referralplatform',
  identityAccess: 'http://localhost:3001',
  onboardingAccount: 'http://localhost:3002',
  gpAuthorisation: 'http://localhost:3003',
  consentSecurity: 'http://localhost:3004',
  referral: 'http://localhost:3005',
  directory: 'http://localhost:3006',
  booking: 'http://localhost:3007',
  specialistReview: 'http://localhost:3008',
  followupRecall: 'http://localhost:3009',
  notification: 'http://localhost:3010',
  gpPortal: 'http://localhost:3100',
  specialistPortal: 'http://localhost:3101',
  patientWeb: 'http://localhost:3102',
};

/**
 * e2e-only Keycloak test users — see infra/keycloak/realm-export.json's
 * `_e2eTestUserComment` entries. Fixed username/password, added alongside
 * this suite specifically so it can obtain real, correctly-signed Keycloak
 * tokens via Resource Owner Password Credentials rather than driving the
 * hosted login UI (which, for the two clinician personas, mandatorily
 * requires WebAuthn/passkey — see README.md, "Why ROPC and not the real
 * login UI").
 */
export const testUsers = {
  gp: { username: 'gp.test', password: 'TestPassword123!', clientId: 'gp-portal' },
  specialist: { username: 'specialist.test', password: 'TestPassword123!', clientId: 'specialist-portal' },
  patient: { username: 'patient.test', password: 'TestPassword123!', clientId: 'patient-web' },
};
