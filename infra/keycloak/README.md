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
- **Google and Microsoft identity-provider brokers, disabled by default, and
  configured `linkOnly: true` + `hideOnLoginPage: true`** — per
  `claude/solution-architecture-tech-stack.md`, social login is a convenience
  sign-in method layered on an already-verified account, never how an account
  gets created. `linkOnly` is the actual Keycloak-level enforcement of that:
  with it set, these providers cannot be used for a fresh login or
  first-broker-login registration at all — the only way to reach them is
  Keycloak's Client Initiated Account Linking endpoint
  (`/realms/{realm}/broker/{provider}/link`), which requires an already-valid
  SSO session. `firstBrokerLoginFlowAlias: social-linking-only` (see
  `authenticationFlows` below) is defense-in-depth on top of that — that flow
  contains only "Confirm Link Existing Account", no create-new-user branch, so
  a future config mistake that flips `linkOnly` off still can't cause a social
  login to silently create an account. `services/identity-access/src/account-links`
  is the one place in the platform that constructs a link URL, and it requires
  a verified bearer token first — see that service's BUILD_LOG entry. Fill in
  real client id/secret and flip `enabled: true` when actually wiring this up;
  Facebook is deliberately not present (see that doc's "Facebook is
  deliberately left out" section).
- **WebAuthn/passkey policy** — realm-level `webAuthnPolicy*` (2FA) and
  `webAuthnPolicyPasswordless*` (full passkey) settings, plus the
  `webauthn-register` / `webauthn-register-passwordless` required actions.
  Keycloak has exactly one policy of each kind per realm — the
  clinician-vs-patient/carer assurance-level difference (AAL2/AAL3 mandatory
  vs. AAL1/AAL2 encouraged, per `identity-security-recommendations.md` section 6) is enforced by two different **authentication flows**, not two policies:
  - `clinician-browser` (bound to `gp-portal`/`specialist-portal` via
    `authenticationFlowBindingOverrides`): passkey/hardware key is
    `REQUIRED` with no password/OTP fallback at all.
  - `patient-carer-browser` (bound to `patient-web`/`patient-mobile`): passkey
    is offered as an `ALTERNATIVE` to password+conditional-OTP, i.e.
    encouraged, not mandatory.
- **A mocked myID (TDIF) OIDC identity provider** (`myid`, disabled by
  default) — points at `services/identity-access`'s own in-process mock IdP
  (`src/mock-myid`, MOCK — replace with real integration) rather than a real
  TDIF-accredited issuer, so the relying-party wiring shape is real and
  testable end to end today, and becomes a config-only change (issuer/client
  credentials/JWKS URL) once a real myID integration exists. Unlike
  google/microsoft this is deliberately **not** `linkOnly` — see the
  provider's own `_mockComment` in `realm-export.json` for why (it's a future,
  Onboarding & Account Service-owned higher-assurance path, not a convenience
  sign-in method).
- **Service-account Admin API access for `identity-access-service`** — the
  `users` entry granting its service account `realm-management`'s
  `manage-users`/`view-users` client roles, so
  `services/identity-access/src/keycloak-admin` can list/revoke a caller's own
  WebAuthn credentials and manage federated-identity links via the Admin REST
  API. Deliberately not `manage-realm` or `manage-clients` — least privilege.

## What's NOT in here yet

- The **carer-vs-patient / OTP custom authentication flow** — the SMS-link →
  DOB/Medicare verification → patient-vs-carer branch → OTP flow described in
  `claude/identity-security-recommendations.md` is genuinely non-standard and
  deliberately NOT modelled as a Keycloak flow here — it's the Onboarding &
  Account Service's job to orchestrate in front of Keycloak (SMS link → verify
  → branch → OTP → Keycloak user creation), not a realm login flow. See that
  service's own build.
- **Step-up authentication's actual `acr` emission** — `services/identity-access`
  now _reads_ an elevated `acr`/`amr` claim to gate sensitive actions (passkey
  revocation, social-link removal — see `src/common/step-up`), but this realm
  doesn't yet define the Conditional-OTP/ACR-to-LoA authentication flow that
  would actually populate a distinguishable `acr` value after a fresh
  passkey/hardware-key re-auth. Until that flow is added here, every step-up
  check will reject any token that wasn't crafted to carry it — flagged in
  both `realm-export.json` (`_stepUpAuthenticationComment`) and that service's
  BUILD_LOG, not silently assumed to work.
- **This realm-export.json has not been imported into a running Keycloak
  instance in this build's sandbox** (no Docker daemon was reachable — same
  constraint noted in root `CONVENTIONS.md` §14 for `docker compose up`
  generally). It's valid JSON (verified with `jq empty`) and every field name/
  shape used here (`webAuthnPolicy*`, `authenticationFlows`/
  `authenticationExecutions`, `linkOnly`, the `users[].serviceAccountClientId`
  - `clientRoles` pattern for service-account role grants) matches Keycloak
    26's documented realm-export schema, but **confirm it actually imports
    clean** the first time a real Keycloak is available:
    `docker compose up -d keycloak && docker compose logs keycloak` and check
    for import errors, then re-export with `kc.sh export` and diff.

## Editing this file

Prefer exporting from a running dev Keycloak instance (`kc.sh export`) once real
auth flows exist, rather than hand-editing the JSON — hand-editing is fine for the
skeleton-stage structure above.
