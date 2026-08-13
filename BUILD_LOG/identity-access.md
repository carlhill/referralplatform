# BUILD_LOG: identity-access-service

2026-08-13 — initial real implementation (previously scaffold-only).

## What was built

### 1. Keycloak realm config (`infra/keycloak/realm-export.json`, `infra/keycloak/README.md`)

- **WebAuthn/passkey policy**: realm-level `webAuthnPolicy*` (2FA) and
  `webAuthnPolicyPasswordless*` (full passkey) settings, plus the
  `webauthn-register` / `webauthn-register-passwordless` required actions.
  Keycloak has exactly one policy of each kind per realm, so the
  clinician-vs-patient/carer assurance-level difference is enforced by **two
  custom authentication flows**, not two policies:
  - `clinician-browser` (bound to `gp-portal`/`specialist-portal` via
    `authenticationFlowBindingOverrides`) — passkey/hardware key `REQUIRED`,
    no password/OTP fallback at all (AAL2/AAL3 mandatory, per
    `identity-security-recommendations.md` §6).
  - `patient-carer-browser` (bound to `patient-web`/`patient-mobile`) —
    passkey offered as an `ALTERNATIVE` to password+conditional-OTP
    (encouraged, not mandatory — AAL1/AAL2).
- **Google/Microsoft as secondary-link-only**: both IdPs now have
  `linkOnly: true` + `hideOnLoginPage: true` (the actual Keycloak-level
  enforcement — with `linkOnly` set, Keycloak refuses to use the provider for
  a fresh login or first-broker-login registration at all) plus
  `firstBrokerLoginFlowAlias: social-linking-only`, a custom flow containing
  only "Confirm Link Existing Account" (`idp-confirm-link`), no
  create-new-user branch, as defense-in-depth on top of `linkOnly`.
- **Mock myID (TDIF) OIDC identity provider** (`myid`, `providerId: oidc`,
  disabled by default) — points at this service's own in-process mock IdP
  (see below), not a real TDIF issuer. Deliberately **not** `linkOnly`,
  unlike google/microsoft — myID is framed in
  `identity-security-recommendations.md` §6 as a future higher-assurance
  *elevation* path (authorised-representative tier, GP/specialist onboarding
  proofing), which is account-creation-adjacent and belongs to the
  Onboarding & Account Service's flow, not a convenience sign-in method.
- **Service-account Admin API access**: added a `users` entry granting
  `identity-access-service`'s client-credentials service account the
  `realm-management` client roles `manage-users`/`view-users` — least
  privilege (not `manage-realm`/`manage-clients`) needed for
  `src/keycloak-admin` to manage a caller's own credentials/federated
  identities via the Admin REST API.
- **Client `authenticationFlowBindingOverrides`** wiring each of the four
  public frontend clients to the correct browser flow above.

### 2. `src/keycloak-admin` — thin Admin REST API client

Wraps the subset of Keycloak's Admin REST API this service needs:
list/delete a user's WebAuthn credentials, merge in a new "required action"
(forces re-enrolment — e.g. GP-assisted device-loss recovery), list/remove
federated identities. Every call authenticates via a `ServiceTokenProvider`
(client-credentials grant, `packages/auth-client`) built with an injectable
`fetchImpl` so it's fully unit-testable without a live Keycloak — 5 tests in
`keycloak-admin.service.spec.ts`, all mocking the token endpoint *and* the
Admin API call separately, since both go through the same fetch.

### 3. `src/passkeys` — a caller's own passkey/WebAuthn credential management

`GET /passkeys`, `DELETE /passkeys/:credentialId` (step-up gated — see
below), `POST /passkeys/require-reenrolment`. Registration/login themselves
are Keycloak's job (the realm flows above) — this module manages credentials
Keycloak already holds. Every call is scoped to `principal.sub` (the
verified caller's own subject id from the bearer token), never a
client-supplied user id — `revoke()` first re-lists the caller's own
credentials and 404s (not 403) if the target id isn't in that list, so the
endpoint never confirms/denies another account's credential ids.

### 4. `src/account-links` — the ONE place a Google/Microsoft link can be initiated

`POST /account/social-links/:provider/link-url`, `GET
/account/social-links`, `DELETE /account/social-links/:provider`. This is
the concrete mechanism behind "social login never creates or activates an
account":

- Every route requires an already-authenticated caller — enforced by
  `requireAuth` middleware from `packages/auth-client`, applied in
  `app.module.ts`'s `configure()` to exactly `PasskeysController` and
  `AccountLinksController` (not `HealthController`/`MockMyIdController`,
  which are deliberately public).
- `LINKABLE_PROVIDERS = ['google', 'microsoft']` is an explicit allow-list —
  `myid` and any other string are rejected with `BadRequestException`
  (tested).
- Builds a real Keycloak "Client Initiated Account Linking" URL:
  `{issuer}/broker/{provider}/link?client_id=&redirect_uri=&nonce=&hash=`,
  where `hash = base64url(sha256(nonce + sessionId + clientId +
  providerAlias))` — Keycloak's documented algorithm for that endpoint. The
  `sessionId` is the caller's Keycloak SSO session id (`sid` ID-token claim),
  supplied by the frontend, since this service's own access-token
  verification doesn't reliably carry `sid`.
- `redirectUri` is validated against `ACCOUNT_LINK_ALLOWED_ORIGINS` (env var,
  comma-separated) — an explicit open-redirect guard, tested.
- Persists a single-use `AccountLinkRequest` nonce row (Prisma,
  `identity_access` schema) with a 5-minute TTL.

### 5. `src/mock-myid` — MOCK, replace with real integration

A small, fully working, self-contained in-process OIDC identity provider
standing in for myID (TDIF), since no real TDIF-accredited credential exists
for this build. Implements the real protocol surface Keycloak needs as an
OIDC relying party: `/.well-known/openid-configuration`, `/authorize`
(validates `client_id`/`response_type`, auto-approves with a canned or
`login_hint`-derived identity — MOCK, real IdP would show an actual login/
consent screen — and 302-redirects with a single-use authorization code),
`/token` (authorization_code exchange, validates client credentials, issues
a **real RS256-signed JWT id_token** via `jose` against an in-memory
generated keypair, plus an opaque access_token), `/userinfo`, `/jwks`.
Session state (auth codes, access tokens, the RSA keypair) is
process-memory-only — acceptable only because this is a throwaway dev/test
stand-in, not a durable record.

Verified with a **real cryptographic round trip**, not mocks-all-the-way-down:
`mock-myid.service.spec.ts` and `test/mock-myid.e2e-spec.ts` (the latter over
real HTTP via supertest, booting only `MockMyIdModule` so it needs no DB) both
exchange a code for tokens and then independently verify the returned
`id_token`'s signature using `jose.jwtVerify` against the service's own
published JWKS — proving the token isn't just a plausible-looking string.

### 6. `src/common/step-up` — assurance-level (AAL2/AAL3) enforcement

`assertStepUp(principal, requiredAcr)` — checks `acr`/`amr` claims on
`AuthenticatedPrincipal.raw` per the pattern root `CONVENTIONS.md` §8
documents but leaves to each service. Used to gate `DELETE /passkeys/:id`
and (recommended, not yet wired — see Gaps) social-link removal. **Known,
documented gap**: the realm doesn't yet emit a distinguishable elevated
`acr` after a fresh passkey re-auth (no Conditional-OTP/ACR-to-LoA flow
exists yet — flagged in both `infra/keycloak/README.md` and
`realm-export.json`'s `_stepUpAuthenticationComment`), so today every
step-up check rejects any token not deliberately crafted to carry it. The
function is written against the claim shape it *will* need so callers don't
change when that flow lands.

## Key decisions / judgment calls

1. **Passkey registration/login is Keycloak's job, not reimplemented here.**
   Considered hand-rolling WebAuthn ceremonies with `@simplewebauthn/server`
   in this service, but Keycloak (already the platform's IdP, per
   `solution-architecture-tech-stack.md`) has native WebAuthn support —
   reimplementing it would mean maintaining a second, parallel credential
   store and figuring out how to mint a real Keycloak session/token after an
   out-of-band ceremony (no clean, safe way to do that without either a
   Keycloak custom SPI or Token Exchange configuration, both out of scope
   here). This service instead owns realm policy + credential
   management/step-up on top of Keycloak's own WebAuthn.

2. **`packages/shared-types`' `AuditEventType` union doesn't have IAM/
   credential-security event types** (only clinical/consent-record types).
   Per that file's own doc comment the correct fix is additive
   (`credential.revoked` etc.), but `packages/shared-types` is outside this
   agent's assigned scope. Rather than either editing a shared package from
   here or repurposing an unrelated existing type (which would corrupt audit
   semantics), `src/common/audit/identity-audit-events.ts` defines local
   event-name constants and casts at the `auditClient.record()` call site,
   with a loud comment explaining why and what the real fix is. These are
   IAM events, not clinical/consent writes, so they use the direct-call
   audit pattern (CONVENTIONS §7's "acceptable ... for genuinely
   non-clinical, non-consent events"), not the outbox pattern — no
   clinical-record transaction they need to stay atomic with.

3. **Touched `infra/keycloak/*` and `docker-compose.yml`'s
   `identity-access:` block despite the "only touch services/identity-access"
   scope instruction.** Judgment call: a real Keycloak realm config is an
   explicit, named deliverable of this task ("a real Keycloak realm
   configuration (exported realm JSON, imported via docker-compose)") and
   `infra/keycloak/README.md` already earmarked exactly these TODOs ("build
   these as the real services land") for whoever builds this service. Edits
   were kept minimal and additive (no restructuring of other services'
   entries). Did **not** touch `packages/auth-client` despite the task
   description's "finish packages/auth-client with real token verification
   helpers" line — that package was already complete (`TokenVerifier`,
   `ServiceTokenProvider`, `requireAuth`, `requireRole`) and editing a
   different agent's shared package felt like the higher-risk call given the
   directory-scope instruction's emphasis; see "Suggested follow-up" below
   for the one real gap found in it.

4. **`AccountLinkRequest.sessionId` must come from the frontend, not derived
   server-side** — this service's access-token verification
   (`packages/auth-client`'s `TokenVerifier`) checks the OAuth *access*
   token, which doesn't reliably carry Keycloak's `sid` claim by default;
   the ID token does. Documented in the DTO and service rather than silently
   assumed.

## What's mocked

- **`src/mock-myid`** — the entire myID/TDIF identity provider. Clearly
  labelled `MOCK — replace with real integration` in every file. Real
  integration needs actual TDIF accreditation (or use of an accredited
  broker) and swapping the `myid` IdP's `config.*Url`/client-credential
  values in `realm-export.json` — the relying-party wiring shape doesn't
  change.

## Known gaps / incomplete

- **`prisma generate` could not be run in this sandbox** — this sandbox's
  egress policy blocks `binaries.prisma.sh` (confirmed via
  `curl $HTTPS_PROXY/__agentproxy/status`: `connect_rejected`, "gateway
  answered 403 to CONNECT (policy denial)"), so the Prisma engine binaries
  needed by `prisma generate`/`migrate dev` couldn't download. Per this
  environment's own guidance, org-policy 403s aren't retried/worked around.
  Consequences and mitigations:
  - `prisma/migrations/20260813120000_init/migration.sql` (the
    `AccountLinkRequest` table) was **hand-written** to match
    `schema.prisma` rather than generated by `prisma migrate dev`, since
    that command also needs the blocked engine binary. It follows Prisma's
    standard migration SQL shape but has not been applied against a real
    Postgres or diffed against a real `prisma migrate dev` run — verify with
    `npm run prisma:migrate -w services/identity-access -- --name init` (it
    should report the schema already in sync, or highlight a diff to fix)
    once network access to `binaries.prisma.sh` is available.
  - To type-check/build/test in *this* sandbox, a minimal hand-written stub
    was placed at `node_modules/.prisma/client/` (NOT part of the repo —
    `node_modules/` is gitignored, this was purely a local, throwaway
    verification aid) implementing just enough of `PrismaClient`'s shape
    (`accountLinkRequest.{create,findUnique,update}`, `$connect`,
    `$disconnect`) for the real code to compile and for
    `test/health.e2e-spec.ts` to boot the full `AppModule`. Every real
    Prisma call this service makes is otherwise exercised only through
    mocked `PrismaService` instances in unit tests (see
    `account-links.service.spec.ts`), not against a real database.
    **Run `npm run prisma:generate -w services/identity-access` for real**
    the first time this service is built somewhere with network access —
    it will overwrite that directory with the genuine generated client.
- **Realm import has not been verified against a running Keycloak** — no
  Docker daemon was reachable in this sandbox either (`docker ps` →
  `connect: no such file or directory`), consistent with the same class of
  gap root `CONVENTIONS.md` §14 already documents for this scaffold. The
  realm JSON is valid (`jq empty` passes) and every field/shape used
  (`webAuthnPolicy*`, `authenticationFlows`/`authenticationExecutions`,
  `linkOnly`, the `users[].serviceAccountClientId` + `clientRoles` pattern)
  matches Keycloak 26's documented realm-export schema, but **confirm it
  imports clean** the first time a real Keycloak is available: `docker
  compose up -d keycloak && docker compose logs keycloak`.
- **Step-up authentication's `acr` emission isn't wired in the realm yet** —
  see `src/common/step-up`'s doc comment and
  `infra/keycloak/README.md`/`realm-export.json`'s
  `_stepUpAuthenticationComment`. `assertStepUp()` is real, enforced, and
  tested against the claim shape it expects; the realm just doesn't emit
  that claim shape yet.
- **`recordLinkCompleted()`** (`account-links.service.ts`) exists and is
  tested but isn't wired to a real trigger — a production build needs either
  a Keycloak event listener SPI or a webhook calling back into this service
  once a broker link actually completes, to consume the nonce and write the
  final audit entry. Noted in the method's own doc comment.
- **`docker-compose.yml`'s `identity-access:` environment block** was
  updated with the new env vars this build introduced
  (`ACCOUNT_LINK_ALLOWED_ORIGINS`, `STEP_UP_ACR`, `MOCK_MYID_*`) — not
  independently verified against a running stack for the same
  no-Docker-daemon reason as above.

## Suggested follow-up for `packages/auth-client` (not edited — out of scope)

`packages/auth-client` currently exports Express-style middleware
(`requireAuth`/`requireRole`), which works fine mounted via Nest's
`MiddlewareConsumer` (used here) but isn't as idiomatic for the ~11 other
NestJS services that will want a `CanActivate` guard + `@CurrentPrincipal()`
param decorator instead of reaching into `req.auth` by hand (see
`src/common/authenticated-request.ts` in this service for the workaround
used here). Worth adding a `nest-guard.ts` to that package next time it's
touched.

## How to run/test this service in isolation

```bash
# from the monorepo root
npm install
cp services/identity-access/.env.example services/identity-access/.env

# unit tests — no external dependencies required, all 36 pass in this sandbox
npm run test -w services/identity-access

# typecheck / lint / build — all clean in this sandbox
npm run typecheck -w services/identity-access
npm run lint -w services/identity-access
npm run build -w services/identity-access

# e2e — test/mock-myid.e2e-spec.ts boots only MockMyIdModule (no DB/Keycloak
# needed, passes standalone); test/health.e2e-spec.ts boots the full
# AppModule (needs `docker compose up -d postgres redis keycloak` first in a
# real environment, and `prisma generate` to have been run for real)
npm run test:e2e -w services/identity-access

# once infra is reachable:
docker compose up -d postgres redis keycloak
npm run prisma:migrate -w services/identity-access -- --name init
npm run start:dev -w services/identity-access   # -> http://localhost:3001/health
```

Manually exercised in this sandbox: the mock myID IdP's full
`/authorize` → `/token` → `/jwks`-verified `id_token` → `/userinfo` round
trip, over real HTTP (`test/mock-myid.e2e-spec.ts`), and the full
`AppModule` DI graph booting cleanly end to end (`test/health.e2e-spec.ts`,
using the local Prisma stub noted above in place of a real database
connection).
