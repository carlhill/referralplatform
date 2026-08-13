# infra/keycloak

`realm-export.json` is imported automatically when the `keycloak` container in
`docker-compose.yml` starts (`start-dev --import-realm`), giving local dev a working
`referralplatform` realm without a manual setup step.

## What's in here already

- **Realm roles**: `patient`, `carer_delegate`, `carer_authorised_representative` (the
  two-tier representative model from `claude/identity-security-recommendations.md`
  section 2), `gp`, `specialist`, `internal_staff`.
- **One confidential client per backend service** (`identity-access-service`,
  `referral-service`, ... — client credentials grant only, `serviceAccountsEnabled`),
  secret `change-me-in-local-env` matching each service's `.env.example` /
  `docker-compose.yml` `KEYCLOAK_CLIENT_SECRET` — used via
  `packages/auth-client`'s `ServiceTokenProvider` for service-to-service calls
  (e.g. calling the Audit Log Service).
- **One public client per frontend** (`gp-portal`, `specialist-portal`,
  `patient-web`, `patient-mobile`) — authorization code flow with PKCE, redirect
  URIs pointed at each app's local dev port.
- **Google and Microsoft identity-provider brokers, disabled by default** — per
  `claude/solution-architecture-tech-stack.md`, social login is a convenience
  sign-in method layered on an already-verified account, never how an account
  gets created. Fill in real client id/secret and flip `enabled: true` when
  actually wiring this up; Facebook is deliberately not present (see that doc's
  "Facebook is deliberately left out" section).

## What's NOT in here yet — build these as the real services land

- The **carer-vs-patient / OTP custom authentication flow** — the SMS-link →
  DOB/Medicare verification → patient-vs-carer branch → OTP flow described in
  `claude/identity-security-recommendations.md` is genuinely non-standard and
  needs a custom Keycloak authentication flow (or to be orchestrated by the
  Onboarding & Account Service in front of Keycloak) — not a stock Keycloak flow.
- **Passkey/WebAuthn policy** — required for GP/specialist clients (AAL2/AAL3 per
  `identity-security-recommendations.md` section 6), encouraged for patients/carers.
  Configure via the realm's WebAuthn Policy settings once the Identity & Access
  Service is being built.
- **myID (TDIF) as an OIDC identity provider** — the "lightweight path" recommended
  over seeking TDIF accreditation directly (see `claude/solution-architecture-tech-stack.md`,
  "Identity and access").
- **Step-up authentication** for sensitive actions (approving a new GP link,
  granting deceased-patient access) — a Keycloak authentication flow with a
  conditional OTP/re-auth step, referenced from `packages/auth-client`'s
  `AuthenticatedPrincipal.raw` (`acr`/`amr` claims).

## Editing this file

Prefer exporting from a running dev Keycloak instance (`kc.sh export`) once real
auth flows exist, rather than hand-editing the JSON — hand-editing is fine for the
skeleton-stage structure above.
