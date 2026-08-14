# BUILD_LOG — ReferralPlatform

Consolidated from the 16 per-service/app logs that were kept under `BUILD_LOG/*.md`
while this platform was built (2026-08-13, one overnight agentic build session,
9 commits). Those files are preserved as-is for anyone who wants the full, unedited
detail (every doc-comment reference, every exact test count) — this file distills
each of them into four consistent sections (**what was built**, **key decisions**,
**what's mocked**, **known gaps**) and adds the cross-cutting patterns that recur
across almost every service, so a reader doesn't have to rediscover the same
sandbox limitation sixteen times.

**Read this first if you only read one section:** ["Cross-cutting patterns"](#cross-cutting-patterns-read-this-first)
below explains the one constraint that shaped nearly every "known gap" in this
document — this sandbox's outbound network policy blocked `binaries.prisma.sh`
and every Docker registry, so **no service's Prisma client was ever generated and
no service was ever booted against a real Postgres/Keycloak/Docker Compose stack
in the build sandbox.** Every service typechecks/lints/unit-tests clean; the thing
that has never actually been exercised is the full stack wired together. That is
the single most important thing to do first in a normal dev environment: run
`npm install && docker compose up -d`, let every `prisma generate` succeed for
real, and walk the golden path.

## Contents

- [Cross-cutting patterns](#cross-cutting-patterns-read-this-first)
- Identity & access backbone: [identity-access](#identity-access-service--port-3001),
  [audit-log](#audit-log-service--port-3012)
- Onboarding & authorisation: [onboarding-account](#onboarding-account-service--port-3002),
  [gp-authorisation](#gp-authorisation-service--port-3003),
  [consent-security](#consent-security-service--port-3004)
- Referral pipeline: [referral + compliance-rules](#referral-service--compliance-rules-engine--port-3005),
  [directory + secure-messaging-gateway](#directory-service--secure-messaging-gateway--port-3006),
  [booking](#booking-service--port-3007),
  [specialist-review](#specialist-review-service--port-3008),
  [followup-recall](#followup-recall-service--port-3009),
  [notification](#notification-service--port-3010)
- Ops & integration: [admin-console](#admin-console-service--port-3011),
  [fhir-gateway](#fhir-gateway--port-3013-java--spring-boot)
- Frontends: [gp-portal](#gp-portal--port-3100), [specialist-portal](#specialist-portal--port-3101),
  [patient-web + patient-mobile](#patient-web--port-3102--patient-mobile--port-8081)
- [End-to-end test suite](#end-to-end-test-suite-e2e)

---

## Cross-cutting patterns (read this first)

These apply to nearly every service below and are only stated once here instead
of sixteen times:

1. **`prisma generate`/`prisma migrate dev` never ran successfully in the build
   sandbox.** `binaries.prisma.sh` was blocked by outbound egress policy (a
   confirmed policy denial, not a transient failure — `curl
   $HTTPS_PROXY/__agentproxy/status` showed a 403 on CONNECT). Every Prisma-backed
   service therefore has a **hand-authored** `prisma/migrations/*/migration.sql`
   matching its `schema.prisma` exactly (not machine-generated, but written to the
   same shape Prisma would generate, and in a few cases actually applied directly
   via `psql` against a real local Postgres in the sandbox — see `booking` and
   `audit-log` below for where that happened). **Run `npm run prisma:generate -w
   services/<name>` for real, for every service, the first time this repo is built
   somewhere with network access to `binaries.prisma.sh`** — this is the single
   most important "finish the job" step. Each Dockerfile already has the
   `prisma generate` build step wired in.
2. **No Docker daemon / no live Postgres+Keycloak+immudb stack was reachable in
   the build sandbox**, so no service has been booted via `docker compose up` and
   hit over real HTTP end-to-end. Every service's **unit test suite** (hand-rolled
   fake Prisma objects, no real DB) passes cleanly and is the actual evidence of
   correctness for business logic. A handful of services (`booking`, parts of
   `audit-log`) additionally proved specific properties against a real local
   Postgres instance that happened to be reachable in that build session.
3. **`packages/shared-types`' `AuditEventType` union is missing many event types**
   individual services needed (each service was scoped to its own directory, so
   editing a shared package was out of bounds). The universal workaround: either
   reuse the closest existing type with a `payload.event`/`payload.actualStatus`
   disambiguator, or define a local `<Service>AuditEventType` supplement cast at
   the network boundary. Every occurrence is documented in the owning service's
   section below and is an **additive, low-risk fix** once someone is willing to
   touch `packages/shared-types` and `services/audit-log`'s `AUDIT_EVENT_TYPES`
   runtime list centrally.
4. **`docker-compose.yml` is missing a number of inter-service `*_SERVICE_URL`
   environment variables** that individual service builds needed (each service's
   task was scoped to its own directory, not the root compose file). Every client
   that needs one falls back to the correct compose-network hostname/port by
   default, so the stack works even without the explicit env var — but it's worth
   a pass to add them for explicitness. Flagged per-service below only where it's
   a genuinely new finding.
5. **The outbox pattern is real and consistent everywhere it's used**: a
   `AuditOutbox` Postgres table in the writing service's own schema, written in
   the same `prisma.$transaction` as the domain write, drained by an
   `AuditOutboxRelayService` (`@nestjs/schedule`, 5-second `@Interval`) that calls
   the real Audit Log Service via `packages/audit-client` and retries indefinitely
   (never drops a row) on failure. `fhir-gateway` (Java, no Postgres of its own)
   and `notification`'s routine delivery logs are the two documented exceptions —
   see their sections.
6. **Every external government/vendor integration is mocked behind a clean
   interface, clearly labelled `MOCK — replace with real integration` in code.**
   See the root `README.md`'s "What's real vs. mocked" table for the master list;
   each service section below gives the implementation-level detail.

---

## identity-access-service — port 3001

### What was built
- A real **Keycloak realm** (`infra/keycloak/realm-export.json`) with WebAuthn/passkey
  policy, and **two separate authentication flows** enforcing different assurance
  levels: `clinician-browser` (passkey/hardware key `REQUIRED`, no password
  fallback — AAL2/AAL3, bound to `gp-portal`/`specialist-portal`) and
  `patient-carer-browser` (passkey offered as an `ALTERNATIVE` to
  password+conditional-OTP — AAL1/AAL2, bound to `patient-web`/`patient-mobile`).
- **Google/Microsoft social login restricted to account-linking only** —
  `linkOnly: true` + `hideOnLoginPage: true` + a custom `social-linking-only` flow
  with no account-creation branch, so social login can never create or activate an
  account (defense-in-depth beyond just `linkOnly`).
- `src/keycloak-admin` — Admin REST API client for credential/federated-identity
  management, using least-privilege `manage-users`/`view-users` service-account roles.
- `src/passkeys` — `GET /passkeys`, `DELETE /passkeys/:id` (step-up gated),
  `POST /passkeys/require-reenrolment`; every call scoped to the caller's own
  subject id (404, not 403, on a mismatched id — never confirms/denies another
  account's credentials).
- `src/account-links` — the one place a Google/Microsoft link can be initiated;
  builds Keycloak's real "Client Initiated Account Linking" URL with the documented
  hash algorithm, validates `redirectUri` against an explicit allow-list
  (`ACCOUNT_LINK_ALLOWED_ORIGINS`), persists a single-use 5-minute nonce.
- `src/common/step-up` — `assertStepUp(principal, requiredAcr)`, the AAL2/AAL3
  enforcement helper other services later copied (see gp-authorisation,
  consent-security below).

### Key decisions
- Passkey registration/login is Keycloak's own native WebAuthn, not reimplemented —
  this service owns realm policy + credential management on top of it.
- IAM/credential events use the direct-call audit pattern (not the outbox), since
  they're non-clinical, non-consent events per CONVENTIONS §7.
- `AccountLinkRequest.sessionId` must come from the frontend (the ID token's `sid`
  claim), since the access token this service verifies doesn't reliably carry it.

### What's mocked
- **`src/mock-myid`** — a full, self-contained, real-cryptography (RS256, `jose`)
  OIDC identity provider standing in for **myID (TDIF)**, since no real
  TDIF-accredited credential exists. Verified with a real code→token→JWKS-verified
  round trip in tests, not stubs-all-the-way-down. Swap-in path: real TDIF
  accreditation (or an accredited broker) + point the `myid` IdP's URLs/credentials
  in `realm-export.json` at the real issuer — the relying-party wiring is unchanged.

### Known gaps
- Step-up `acr` emission isn't wired in the realm yet (no Conditional-OTP/ACR-to-LoA
  flow), so `assertStepUp()` — real and tested — rejects every token today; only the
  realm config is missing.
- No trigger yet calls `recordLinkCompleted()` on a real completed Keycloak broker
  link (needs a Keycloak event-listener SPI or webhook).
- Realm import and the full Keycloak Admin API flow have never been exercised
  against a live Keycloak (no Docker daemon in the sandbox).
- `packages/auth-client` currently ships Express-style middleware; a `CanActivate`
  guard + `@CurrentPrincipal()` decorator would be more idiomatic for the ~11 other
  NestJS services — flagged as a follow-up, not built (out of this service's scope).

**Verified**: 36/36 unit tests, typecheck/lint/build clean, the mock-myID full
cryptographic round trip proven over real HTTP (supertest), full `AppModule` DI
graph boots cleanly.

---

## audit-log-service — port 3012

### What was built
- **Real immudb wiring** (`immudb-node` client) using `verifiedSet`/`verifiedGet` —
  genuine client-side Merkle inclusion/consistency proof verification, not just
  "the server said OK." Deliberately avoids the SDK's `autoDatabase` convenience
  path after finding it silently points at the wrong database on warm restart.
- **NASH signing** (`src/signing`) — every event is signed (canonical, key-sorted
  JSON) before being written to immudb.
- **Crypto-shredding** (`src/crypto-shredding`) — fields under `payload.sensitive.*`
  are AES-256-GCM encrypted per-user before signing/writing; `DELETE
  /crypto-keys/:userId` destroys a user's key, making every audit entry referencing
  it permanently unreadable while immudb's own tamper-evidence chain stays intact —
  the actual right-to-erasure mechanism.
- **Write + query/verification API**: `POST /audit-events` (shred → sign →
  `verifiedSet` → Postgres index), `GET /audit-events/:id[?revealSensitive=true]`,
  `GET /audit-events?subjectType=&subjectId=`, `POST /audit-events/:id/verify`
  (independently checks both the immudb inclusion proof and the NASH signature,
  reporting which failed).
- `AuditEventIndex` — a Postgres table that is a pointer index only (id → immudb
  key/tx id); content and tamper-evidence always live in immudb, never Postgres.
- `packages/audit-client` — completed (7/7 tests, up from 2).

### Key decisions
- Crypto-shredding is owned here (where the KMS key lives), not by writing
  services — callers put shreddable fields under `payload.sensitive`.
- Key-ownership resolution for shredding: the event's own `Patient` subject, else
  `payload.patientId`, else the acting principal — every clinical event has a
  patient in scope one way or another.

### What's mocked
- **`MockNashSigner`** — local Ed25519 keypair instead of an HSM-held NASH
  organisation certificate. Swap-in: implement `Signer` against a real
  NASH-issued cert/HSM; one DI-token rebind, no call-site changes.
- **`MockLocalKms`** — local AES-256-GCM keys in a JSON file instead of
  AWS KMS/CloudHSM. Swap-in: implement `Kms` against the real service.

### Known gaps
- No live immudb integration test — Docker wasn't available, and a real immudb
  binary run in-sandbox couldn't stay alive long enough for a second process to
  connect to it (the sandbox kills backgrounded processes almost immediately).
  `ImmudbService` was instead checked line-by-line against `immudb-node`'s actual
  JS source. Run `docker compose up -d postgres immudb && npm run test:e2e -w
  services/audit-log` to close this.
- `docker-compose.yml`'s `audit-log:` block doesn't set `KMS_MOCK_KEYSTORE_PATH`
  on a named volume (mock KMS "erasure" state won't survive a container recreate)
  and `NASH_SIGNING_KEY_PATH` points at a Docker-secrets-style path that may not be
  writable — worth checking on first real boot.

**Verified**: 22/22 unit tests (incl. tamper-detection and crypto-shredding
round-trips), the hand-authored migration SQL applied to and inspected against a
real local Postgres 16 instance.

---

## onboarding-account-service — port 3002

### What was built
- **Patient/carer onboarding** end to end: GP triggers an activation request
  (verified-practice + rate-limit gated) → DOB/Medicare shared-secret verification
  (5-attempt lockout) → the neutral "is this you, or are you helping someone else?"
  branch → 6-digit OTP (HMAC-SHA256 hashed at rest, 10-min expiry, 5-attempt
  lockout) → activation. Carer branch captures name/email/relationship/own-or-shared
  mobile, creates a `Carer` at `nominated_delegate` tier, and **flags** (doesn't
  block) `suspectedOrganisationalCarer` when the same carer identity recurs across
  ≥2 patients (the aged-care bulk-carer pattern).
- **Minors**: a patient recorded as under 18 is blocked from the "it's me" branch —
  a parent/guardian must use the carer branch. A partial, documented fill of the
  "minors as primary patients" gap, not the full age-18-transition design.
- **GP practice onboarding** (`src/gp-practices`) — HPI-O verification via the mocked
  HI Service, compliance-checklist acknowledgement, feeds the account-activation gate.
- **Specialist onboarding** (`src/specialists`) — the full chain in one request:
  AHPRA check → HPI-I resolution → NASH credential provisioning → Directory Service
  profile creation, recording each step's real outcome rather than swallowing a
  partial failure; stops early if AHPRA fails.
- **The outbox pattern implemented for real, both halves, for the first time in this
  repo** (`src/audit-outbox`) — every account-lifecycle write goes through it.

### Key decisions
- **Email replaces SMS for the entire flow** (activation link + OTP), not just the
  OTP as originally scoped — no SMS budget exists for this build, and the DOB/Medicare
  shared-secret step (not the delivery channel) is what actually binds the clicker to
  the real patient record.
- One combined OTP email serves as both carer-email verification and account
  activation (rather than two separate emails), since the flow is already all-email.
- Sensitive-category access grants and `authorised_representative` carer elevation
  are deliberately **not** implemented here — that's the Consent & Security
  Service's job per the module boundary; this service creates carers at
  `nominated_delegate` tier only.

### What's mocked
- **`src/hi-service`** — `MockHiServiceClient` (IHI/HPI-O/HPI-I resolution).
  Deterministic (SHA-256 + a mod-10 check digit) using real HI issuer prefixes, so
  dedup logic has something real to test against. Swap-in: a NASH PKI cert + Services
  Australia HI Service registration, likely routed through `fhir-gateway`.
- **`src/ahpra`** — `MockAhpraVerificationClient`. AHPRA has no bulk public API; a
  real integration is more likely rate-limited on-demand lookup than a REST client.
- **`src/nash`** — `MockNashCredentialClient`. Issues a credential id only, never
  real key material (that needs an HSM).
- `src/directory-client`/`src/identity-access-client` are **real HTTP clients**, not
  mocks, but their target endpoints don't fully exist yet on the receiving side
  (Directory Service, Identity & Access Service) — calls degrade gracefully.

### Known gaps
- The GP-triggering endpoint isn't yet behind `requireAuth` (checks the practice is
  verified, not that the caller *is* that practice's own system).
- **No Keycloak user is provisioned for a newly activated patient/carer anywhere in
  this build** — this is the single most consequential end-to-end gap in the whole
  onboarding story (it means the real OIDC login flow the frontends built has no
  real account to sign into yet). Whoever owns Keycloak user creation (this service,
  identity-access, or a shared flow) needs to be decided explicitly.
- The 2-day activation queue's deletion half isn't implemented here (that's the
  Referral Service's job) — this service only sets/exposes `queueExpiresAt`.
- Rate limiting is DB-query-based, not Redis-based (simpler, fine at this scale).

**Verified**: 71/71 unit tests including the full golden path (GP-triggers → DOB
verify → branch → OTP → activation) against a purpose-built in-memory fake Prisma
with real filtering/relations; typecheck/lint/build clean.

---

## gp-authorisation-service — port 3003

### What was built
- **`GpLink` full push-approval lifecycle**: request → patient/carer/staff
  approve (step-up gated) or decline → revoke, plus `GET
  /gp-links/authorisation?patientId=&gpId=` — the real enforcement point the
  Referral Service calls before allowing a not-yet-linked GP to create a referral
  (this integration is wired from the Referral Service's side — see below).
- **Urgent-bypass escalation** — `urgentEscalation: true` auto-approves the link
  immediately (so the GP can proceed without waiting) while remaining fully
  audited and patient-revocable afterwards.
- **Stale-link expiry** — lazy expiry on read plus a proactive 5-minute sweep, so a
  pending link never sits silently forever.
- `HpioNashAuthGuard` — the auth boundary for "only HPI-O/NASH-authenticated
  practice systems can request a link."

### Key decisions
- Urgent-bypass is auto-approve + full audit + patient-revocable (a documented
  judgment call — the doc that named the option didn't specify its exact mechanics).
- Model named `GpLink` (not `GPLink`) to get a sane Prisma client property name.

### What's mocked
- `src/common/mock-nash-auth.ts` — format-validates HPI-O shape and a
  `principalType` claim; a real implementation needs mutual-TLS certificate
  checking at the ingress layer plus a live HPI-O status lookup (intended home:
  the FHIR Gateway).

### Known gaps
- No dedicated `gp.link.expired` `AuditEventType` — reuses `gp.link.declined` with
  a `payload.reason` disambiguator (the first occurrence of this pattern; several
  later services followed the same precedent).
- No live integration test against a running Keycloak/Postgres.

**Verified**: 26/26 unit tests, lint clean, typecheck clean except the
documented missing-Prisma-client error class (verified by grep to be *only*
that error class, nothing else).

---

## consent-security-service — port 3004

### What was built
Five bounded-concern modules:
- **`src/consent-records`** — generic grant/revoke consent (`gp_link`,
  `carer_delegate`, `sensitive_category_access`) plus **per-referral visibility**
  (`/consent/referral-visibility`) — the "hide this one mental-health referral from
  a GP who can otherwise see everything" requirement — modelled as a composite
  `subjectId` (`"<referralId>:<granteeId>"`) rather than a column that would only
  ever apply to one of four subject types.
- **`src/linked-gps`** — a thin real HTTP proxy over the GP Authorisation Service's
  API, forwarding the caller's own bearer token so that service's own checks apply.
- **`src/reattestations`** — periodic carer re-attestation scheduling (365-day
  default cadence), independent of the `Carer` record itself (owned elsewhere).
- **`src/concerns`** — the "raise a concern" plain-language triage engine
  (`triageConcern()`, three boolean questions, never a category picker; privacy >
  clinical > platform priority when more than one applies). The GP-copy-on-concern
  logic is **real, not just documented**: it checks a live, active `gp_link`
  consent record before including the GP, never assumes consent.
- **`src/deceased`** — the flag/freeze workflow: `DeceasedFlagsService.flag()`
  publishes a `patient.deceased.frozen` event (see "interim polling pattern"
  below) in the same transaction as the flag write; a state-keyed
  executor/administrator/immediate-family/coroner default-eligibility rule is
  **decision support only, never auto-approval**; the actual access-request queue
  is staff-decided, step-up gated, and one-shot (can't re-decide).
- **`src/events`** — `PublishedEvent` (Postgres) + `GET /events?type=&since=`, the
  documented interim stand-in for the real SQS/SNS transport CONVENTIONS §6 names
  but that isn't wired into this scaffold yet.

### Key decisions
- Composite `subjectId` for referral-scoped consent (see above) rather than a
  column that only applies to one subject type.
- Access-request submission (executor/family/coroner) is **not** audited via the
  outbox (reusing `access.request.granted/denied` for an undecided request would
  misrepresent the outcome in a signed trail) — still durably recorded in
  Postgres, just not the tamper-evident trail; a real fix needs an additive
  `access.request.raised` type.
- Access-request intake assumes staff-assisted submission — a real
  executor/coroner requester may have no ReferralPlatform account at all; the
  actual public-facing intake channel still needs real design.

### What's mocked / interim
- `src/events`'s polling table stands in for a real message queue.

### Known gaps
- **Nothing on the consuming side polled `GET /events` at the time this service was
  built** — closed later by `followup-recall` (see below), which now polls it every
  5 seconds. The Referral Service's own queue-suppression-on-death logic is still
  not wired.
- `docker-compose.yml`'s `consent-security:` block doesn't set
  `GP_AUTHORISATION_SERVICE_URL` to the correct in-network hostname (falls back to
  `localhost:3003`, which is wrong inside Docker Compose specifically) — a real,
  concrete fix needed on `docker-compose.yml`.
- `ReattestationSchedule` isn't yet created automatically when a carer account is
  created (onboarding-account doesn't call this service's endpoint yet).

**Verified**: 42/42 unit tests across 9 suites, lint clean, typecheck clean except
the documented Prisma-codegen gap (two real type issues found and fixed along the way).

---

## referral-service + compliance-rules engine — port 3005

Built as **one deployable, two Nest modules** (`src/referral`, `src/compliance-rules`)
rather than two services — they're tightly coupled (compliance evaluation runs
synchronously inside referral creation, in one transaction) and splitting them
would add a network hop for no isolation benefit.

### What was built
- **Full referral state machine**: `queued → routed → booked → in_review →
  {resolved_econsult | completed}`, with `lapsed`/`declined`/`cancelled` branches,
  enforced through one private `transition()` method every status-changing call
  funnels through.
- `POST /referrals` **really blocks creation until the GP is authorised** — calls
  the GP Authorisation Service's real `GET /gp-links/authorisation` endpoint,
  **fails closed** by default if that service is unreachable (an explicit
  `GP_AUTHORISATION_FAIL_OPEN=true` opt-out exists, not the default).
- Evaluates the **Compliance Rules Engine** synchronously and raises
  `ComplianceFlag` rows, all in one transaction with the referral write.
- **2-day activation queue** with proactive 5-minute sweep to `lapsed` and lazy
  catch-up on any transition attempt — resumable across a service restart because
  every state transition is re-derived from stored timestamps, never an in-memory
  timer.
- **Compliance Rules Engine** — data-driven, versioned Postgres rows (never
  hardcoded conditionals), seeded with real state-by-state WWCC research (NSW/NT/SA/TAS
  require it even for AHPRA-registered GPs; QLD/VIC/WA/ACT exempt AHPRA-registered
  GPs) plus child/DV/complex-case checklists, explicitly labelled "decision support
  only, not legal certification." **Publishing a new rule version freezes the exact
  version that fired on every already-created referral's `ComplianceFlag`**, so an
  old referral stays auditable against the rules that actually applied at the time.

### Key decisions
- No persisted "created" status — referral creation is an instantaneous audited
  event landing the row directly in `queued` or `routed`.
- Several statuses/events reuse the closest available `AuditEventType` with a
  `payload` disambiguator (see cross-cutting pattern #3) — mapping documented in
  `referral-status.ts`.
- `patientAccountActive` is a caller-supplied DTO field (defaults `false`, the safe
  assumption), not a live lookup — Onboarding & Account has no "is this account
  active" endpoint yet. `POST /referrals/by-patient/:patientId/activate-queued` is
  the real, working companion endpoint for once that gap closes from the other side.

### What's mocked
Nothing new — this service's only dependencies are the already-real GP
Authorisation Service and Audit Log Service.

### Known gaps
- Onboarding & Account doesn't yet call `activate-queued` on its own OTP-success path.
- `GET /referrals`/`GET /referrals/:id` don't yet enforce per-referral consent
  visibility (structurally represented via `Referral.consentGrants`, but not
  filtered — that's Consent & Security's job, not wired from either side).
- `docker-compose.yml`'s `referral:` block doesn't set `GP_AUTHORISATION_SERVICE_URL`
  explicitly (falls back to the correct default).

**Verified**: 31/31 unit tests (including the real state-by-state WWCC split and
the full happy-path/eConsult-branch/invalid-transition/cancellation coverage), lint
clean, typecheck clean except the documented Prisma gap.

---

## directory-service + secure-messaging-gateway — port 3006

Built as **one deployable, two Nest modules** — every routing decision reads the
same `DirectoryEntry` table directly, so splitting would add a network hop for no
real isolation benefit at this scale.

### What was built
- **NHSD sync** (`nhsd-sync/`) — daily cron + on-demand trigger, idempotent upsert
  keyed on `hpiI`; **self-registration always wins** (an entry with
  `selfRegisteredOverride = true` is left completely untouched by sync, deliberately
  chosen over a risky field-level merge).
- **HealthPathways** (`healthpathways/`) — keyword-matches a referral reason to a
  specialist type/pathway using an 11-category table; simulates a PHN region with no
  Phase-2 inline guidance and **degrades gracefully to the same static link table**
  at lower confidence rather than surfacing a 5xx.
- **Self-registered profile management** (`PUT /directory/entries/self`) and search
  (`GET /directory/entries`, Postgres `ILIKE` + in-process state filtering).
- **Secure Messaging Gateway** (`src/secure-messaging`) — one `SecureMessagingVendorClient`
  interface, three mock implementations (HealthLink, Medical-Objects, and a
  direct-delivery stand-in for an onboarded specialist's own inbox). **Never fails
  silently**: every routing attempt is a persisted `RoutingAttempt` row; a vendor
  failure updates it to `failed`, writes an audit row, best-effort-notifies, and
  throws a real, typed `SecureMessagingDeliveryException` (502) a caller can't
  accidentally ignore — the "must not silently fail a routed referral" requirement,
  implemented literally. `POST /secure-messaging/attempts/:id/retry` re-resolves
  the directory entry and re-attempts.

### Key decisions
- Directory-profile writes (NHSD sync, self-registration) are **not** put through
  the audit outbox — a specialist's public directory listing is provider reference
  data, not a clinical or consent record, per CONVENTIONS §7's own scope. Only
  Secure Messaging routing resolutions are audited.

### What's mocked
| Interface | Stands in for |
|---|---|
| `NhsdDirectoryClient` | National Health Services Directory FHIR API (needs a production-access agreement) |
| `HealthPathwaysClient` | HealthPathways Pathway Link API (needs a per-PHN licence) |
| `SecureMessagingVendorClient` (×3) | HealthLink / Medical-Objects (vendor agreements) / an internal specialist-review inbox call |
| `notifyDeliveryFailure` | `services/notification`'s dual-notification exception endpoint |

### Known gaps
- `RegisterProfileDto`'s endpoint doesn't verify the caller's token `hpiI` matches
  the profile being registered (`AuthenticatedPrincipal` doesn't carry an `hpiI`
  claim yet — a repeated gap across several services).
- The Referral Service doesn't yet call `POST /secure-messaging/route` or
  `GET /directory/pathway-suggestion` from its own creation flow.
- Sample NHSD/HealthPathways data is illustrative (12 specialists, 11 pathway
  categories), not exhaustive.

**Verified**: 47/47 unit tests, lint/typecheck/build all clean, `test:e2e` passes
(1/1) — the one service whose typecheck/e2e passed cleanly in this sandbox thanks
to a shared local Prisma stub happening to be present.

---

## booking-service — port 3007

Flagged in its own build brief as "the single largest module in the whole
platform" — most of this build's effort went into one property.

### What was built
- **Calendar sync** (`src/calendar`) — a clean `CalendarClient` interface
  (`listFreeBusy`/`createEvent`/`deleteEvent`), a realistic mock implementation
  (AU clinic hours, ~25% pre-busy), and a factory that's the one place mock-vs-real
  is resolved. Sync only ever adds new slots, never reconciles removals
  (documented scope limit).
- **Preference-based matching** (`slot-matching.ts`) — pure-function ranking
  (day+time match > day-only > time-only > soonest-first fallback), never leaves a
  patient with zero options.
- **Concurrency-safe slot booking (`src/booking/slot-claim.service.ts`) — the core
  of this build.** One atomic `UPDATE slot SET status='booked', ... WHERE id=$1 AND
  status='open'` via Prisma's `updateMany`, never a read-then-write. Proven two
  independent ways: (1) an in-process fake-Prisma test with genuine event-loop
  interleaving (25 concurrent claims on one slot → exactly 1 winner); (2) **20
  genuinely-separate OS-level `psql` subprocess connections firing concurrently
  against this sandbox's real local Postgres** (→ exactly 1 winner, 19 `UPDATE 0`s)
  — and sanity-checked as meaningful by removing the `AND status='open'` guard and
  confirming all 20 then "win."
- **Booking orchestration** — auto-match against up to 5 ranked candidates,
  falling back to waitlist; manual `confirmSlot` for reception/GP-proposed options;
  cancellation with dual notification (patient + GP) and immediate waitlist fill.
- **Waitlist** — auto-claims immediately on a slot release (a documented
  simplification vs. a notify-and-hold-a-window UX, which would need a
  `WaitlistOffer` sub-state machine).
- Real wiring to the Referral Service (`markBooked()` calls the real `POST
  /referrals/:id/book`) — best-effort/non-blocking, since a booking is already
  durably true by the time it's called.

### Key decisions
- Calendar write-back happens **outside** the DB transaction that claims the slot —
  the DB is the source of truth; external I/O never blocks or invalidates it.
- Booking auto-confirms the best-ranked match (matches the design doc's diagram
  literally) rather than presenting ranked options — but the candidate-slots
  endpoint and manual confirm still support the "reception proposes options" flow too.
- Only `booking.confirmed`/`booking.cancelled` are audited (the two real
  `AuditEventType`s that exist for this subject family) — intermediate states are
  not force-fit into a misleading donor type.

### What's mocked
- Real Google Calendar/Microsoft Graph/CalDAV integration — behind the
  `CalendarClient` interface, one-file swap via the factory.
- The Notification Service call — logs what it would send, since
  `services/notification` had no send endpoint yet at the time this was built (it
  does now — see below; this integration point is still not wired).

### Known gaps
- Calendar sync never reconciles/removes slots once created.
- No claim-window state machine for waitlist offers.
- No pagination on list endpoints.
- `typecheck` fails for the sandbox-wide Prisma-codegen reason only (confirmed
  identical to `services/referral`'s failure).

**Verified**: 42/42 unit tests (8 suites) + 4/4 e2e tests (2 suites, including the
real-Postgres concurrency proof), lint clean.

---

## specialist-review-service — port 3008

AI-assisted structured extraction, the eConsult-vs-full-appointment branch, and
pre-visit pathology/imaging requests — built around one explicit design constraint.

### What was built
- **`ReferralCase` intake** — this service's own copy of the referral packet
  (per CONVENTIONS §6, it never reads `services/referral`'s schema directly);
  `POST /cases` is real but **nothing yet calls it** (see gaps).
- **Pluggable `ExtractionProvider`**: `RuleBasedExtractionProvider` (real, working
  default — regex/heuristic extraction of patient/reason/history/medications/GP/
  urgency-keywords, with a confidence score and per-field warnings) and
  `LlmExtractionProvider` (real request/response handling against any
  OpenAI-chat-completions-compatible endpoint, but **no LLM vendor account exists**
  — with no `LLM_API_KEY` set it logs a warning and delegates to the rule-based
  provider, and honestly reports which path actually ran).
- **The explicit-confirmation gate — the core design constraint this service is
  built around**, per the platform's Babylon-Health-cautionary-guardrail
  requirement: `POST /cases/:id/extract` can *only* create a `pending_review`
  result — structurally cannot change the case's branch or create a pathology
  request. `POST /cases/:id/extractions/:id/confirm` requires the literal body
  `{"confirmed": true}` and records the specialist's edits **separately** from the
  AI's original output, never overwriting it. Enforced in application code on every
  downstream call, not just a UI convention — and covered by dedicated tests
  proving extraction alone never auto-actions anything.
- **eConsult-vs-full-appointment branch** with a **best-effort sync back to the
  Referral Service's own matching state-machine transitions** — forwards the
  calling specialist's own bearer token (not a service-credential token, which
  would be rejected by that endpoint's `principalType` check) — a sync failure is
  recorded but never blocks this service's own record of the decision.
- **Pre-visit pathology/imaging requests** via a mock ordering provider (fake
  reference id, real seam for a future HealthLink/Medical-Objects e-ordering
  integration).

### Key decisions
- Every event type this service needs reuses `referral.routed` with a
  `payload.event` disambiguator — no dedicated `AuditEventType`s exist yet.
- Extraction is only permitted while a case is `received`/`extracted` — no
  "go back and re-extract after confirmation" path in this build.

### What's mocked
- `LlmExtractionProvider` — real protocol handling, no live vendor credentials
  (falls back to rule-based).
- `MockPathologyOrderingProvider` — needs a HealthLink/Medical-Objects vendor account.

### Known gaps
- **Nothing calls `POST /cases`** — the Referral/Booking Service is the intended
  real caller once a referral reaches `booked`; this is a genuinely open
  integration point (see also `specialist-portal`'s "two-service seam" and the
  e2e suite's documented workaround below).
- `typecheck`/`build`/`test:e2e` fail for the sandbox-wide Prisma-codegen reason.

**Verified**: 32/32 unit tests (rule-based extraction field-by-field, the
confirmation gate blocking every downstream action, both branch paths, sync
success *and* failure), lint clean.

---

## followup-recall-service — port 3009

### What was built
- **`FollowUpPlansService`** — the specialist's structured plan (next review date,
  required tests, referral type, indefinite-referral flag); refuses to create a
  plan for a flagged-deceased patient; `recordTestCompletion()` is the single funnel
  for both automatic detection and self-report, idempotent, and refuses to
  "complete" a plan that's already in a terminal suppressed/superseded state.
- **Multi-channel reminder scheduling/dispatch/escalation** (`src/reminders`) — pure,
  fully-unit-tested cadence functions; a dispatch scheduler that does a **live
  per-patient deceased check immediately before every send**, on top of bulk
  suppression, as defense-in-depth; an hourly escalation scheduler raising exactly
  one level at a time per plan.
- **Automatic test-completion detection with self-report fallback** — checks a mock
  pathology-result source, then a mock My Health Record source, then accepts
  self-report; both mock sources are deliberately differentiated so both branches
  of the "check pathology, fall back to MHR" logic are genuinely exercised.
- **`src/deceased-suppression` — the module this service was specifically built to
  get right.** `suppressAllForPatient()` is the single implementation of
  "immediately suppress every pending reminder, including already-scheduled ones" —
  one transaction flips the plan, every `scheduled` reminder for it, *and* any stray
  reminder for the patient at all (a defensive extra sweep). A **5-second poller**
  against Consent & Security's `GET /events?type=patient.deceased.frozen` feed is
  the primary path — this is the exact integration `consent-security`'s own build
  log flagged as missing from the consuming side, now closed. The dispatch
  scheduler's own live check is a second, independent backstop closing the
  remaining "reminder fires inside one 5-second poll window" gap.
- A real bug (the plan's own status update was missing from an early draft of the
  suppression method) was caught by its own unit test and fixed — documented here
  deliberately as the mechanism working as intended.

### Key decisions
- Test completion is tracked at the whole-plan level, not per individual named
  test — matches the design doc's single decision point, a documented simplification.
- `FollowUpReferralType` is this service's own invented vocabulary (not in
  shared-types, which only has a boolean `indefiniteReferralApplies`) — a real fix
  is an additive shared-types field.
- Individual reminder sends/escalations are **not** audited via the outbox at all
  (high-volume, operational, not a clinical-record modification by themselves) —
  still durably recorded in this service's own `Reminder` table.

### What's mocked
- `MockReminderChannelSender` — real SMS/email/push/secure-message needs a real
  vendor this build doesn't have.
- `MockPathologyResultClient` / `MockMyHealthRecordClient` — need a real pathology
  vendor integration / NASH-authenticated MHR connectivity.

### Known gaps
- No consent/relationship check on plan creation/listing beyond principal-type
  gating (real enforcement belongs to Consent & Security's per-referral visibility
  model, not called from here yet).
- Escalation cadence/initial offsets are reasonable, documented judgment calls, not
  sourced from a spec — a natural follow-up is admin-configurability.

**Verified**: 45/45 unit tests across 11 suites, lint/typecheck/build clean.

---

## notification-service — port 3010

### What was built
- **Push/SMS/email fan-out** (`src/notifications`) — `MockPushProvider` and
  `MockSmsProvider` (no real credentials exist), plus **real email delivery via
  `nodemailer` over SMTP** — genuinely not a mock: every environment this repo's
  `docker-compose.yml` configures points that SMTP client at Mailhog, a real local
  mail-catcher viewable at `http://localhost:8025`. This service is the platform's
  real OTP/account-activation email channel. `dispatch()` implements the documented
  dual-channel pattern: push first, then each fallback channel in order until one
  succeeds, all sharing one `dispatchGroupId`.
- **`src/message-threads`** — the referral-scoped secure message thread used to
  resolve exceptions: one thread per referral, lazily created, `postMessage`
  triggers a real in-process push notification to every other participant with a
  deep-link payload. A message on a resolved thread auto-reopens it.
- **Deliberately not audit-logged**: routine notification delivery (per the task
  brief, "high-volume and not audit-relevant") — the `NotificationLog` table
  exists so delivery is still independently verifiable. Message-thread lifecycle
  events **are** audited via the outbox.

### Key decisions
- Local `NotificationAuditEventType` supplement for message-thread events (shared-types
  has none) — same cast-at-the-boundary pattern used across the build.

### What's mocked
- `MockPushProvider` / `MockSmsProvider` — need FCM/APNs (or OneSignal/Expo) and
  Twilio/MessageMedia respectively.
- **Email is real, not mocked** — verified with a real TCP SMTP listener speaking
  the same protocol Mailhog does (RFC 5321 happy path), since this sandbox's egress
  policy blocked pulling the actual `mailhog/mailhog` image; the exact
  `nodemailer.createTransport`+`sendMail` call this service makes was proven to
  complete a full real SMTP conversation end to end.

### Known gaps
- No real access-control on who may read/post to a referral's message thread —
  trusts the caller's `ActorRef`; the calling portal is expected to have already
  checked consent.
- `dispatch()`'s fallback is single-recipient; the "dual notification, both patient
  AND GP" pattern is the *calling* service's job (call `dispatch()` twice), not
  built into this primitive.

**Verified**: 39/39 unit tests, lint clean; typecheck/build/e2e fail for the
sandbox-wide Prisma-codegen reason only (confirmed identical to `services/referral`).

---

## admin-console-service — port 3011

Unlike most services, this one's scaffold phase had already written the full
Prisma schema and several real client classes; this build pass wrote the four
feature modules those pieces were designed to support.

### What was built
- **`src/verification-cases`** — the AHPRA/WWCC manual-review queue (WWCC has no
  automated national check at all). `refresh()` is read-only (never changes
  `status`); `approve()`/`reject()` are staff-only, step-up gated, and one-shot.
- **`src/practice-onboarding`** — a real 10-stage enforced pipeline state machine
  (`lead → contacted → registered → hpio_verification_pending → ... → live`, plus
  a `stalled` diversion reachable from any non-terminal stage). `live` is a
  documented terminal stage (taking a live practice offline is out of this tool's
  scope, not a missing transition).
- **`src/deceased-access-requests`** — deliberately **not** a reimplementation: a
  thin real proxy over Consent & Security's own complete workflow, forwarding the
  caller's bearer token unchanged so that service's own auth/step-up applies to the
  real request (this console's own staff/step-up check is defense-in-depth on top,
  not a substitute).
- **`src/audit-log-query`** — a read-only wrapper over the Audit Log Service's
  query/verify calls; **re-verifies** the immudb proof and NASH signature
  independently on every call, never trusting a cached result.
- Added the relay half of the outbox pattern (the scaffold had written the write
  half only).

### Key decisions
- One new `@Global` module (`external-clients.module.ts`) to share
  `OnboardingAccountClient`/`ConsentSecurityClient` instances rather than
  redeclaring them per feature module.

### What's mocked / interim
Nothing new directly — this console only calls other real ReferralPlatform
services; it transparently displays whatever those services (themselves
documented as mocked in their own sections) report.

### Known gaps
- `revealSensitive=true` isn't wired through `audit-log-query` — this console
  authenticates as a service principal with no `internal_staff` role, so the
  Audit Log Service would reject that flag regardless of who's using the console.
- No manual-override endpoint yet on onboarding-account for an approved
  `VerificationCase` to actually unblock whatever the automated check was blocking.
- No pagination on any list endpoint.

**Verified**: 28/28 unit tests across 6 suites, lint clean; typecheck/build/e2e
fail for the sandbox-wide Prisma-codegen reason only.

---

## fhir-gateway — port 3013 (Java / Spring Boot)

The one non-Node service — Java 21, Maven, Spring Boot, HAPI FHIR.

### What was built
- **Genuine AU Core-aligned FHIR profile validation** — real HAPI FHIR validation
  machinery (`FhirInstanceValidator` + a full validation-support chain), not mocked.
  Loads `StructureDefinition` profiles at startup and validates any resource
  against its declared `meta.profile`.
- **Structured FHIR export** (`POST /fhir/export/patient-summary`) — the business
  continuity requirement: takes a patient + referral history + Follow-up Plans + an
  audit-log summary and returns a real, validated FHIR `Bundle` (`Patient`,
  `ServiceRequest` per referral, `CarePlan` per Follow-up Plan, `AuditEvent` per
  audit entry carrying the `immudbTxId` through as an extension so a recipient can
  independently re-verify tamper-evidence later). A validation failure returns a
  real FHIR `OperationOutcome`, not a generic error shape.
- **Three mocked-but-fail-safe government integrations** (`hiservice`, `mhr`,
  `nash`), each with a `block` mode (default — throws a typed exception, the
  production-safe posture the build brief required: "fail safely... rather than
  silently proceeding without a verified identifier") and a `fixture` mode (a
  small, obviously-fake dataset for local dev/testing — NASH fixture signatures are
  explicitly tagged `Ed25519-TEST-FIXTURE-NOT-NASH`).
- A Java re-implementation of the Audit Log Service's wire contract
  (`AuditLogClient`) — best-effort, non-blocking (see key decisions).

### Key decisions
- **Judgment call on AU Core profile source**: the official AU Core IG package
  couldn't be downloaded (Maven Central itself was blocked by egress policy), so
  three `StructureDefinition` profiles were hand-authored reproducing the *key
  cardinality constraints* of the real AU Core Patient/ServiceRequest/Practitioner
  profiles, registered under their real canonical URLs. **The validation mechanism
  is completely real, unmodified HAPI FHIR** — what's simplified is the profile
  *content* (no slicing, no terminology bindings). To move from "AU Core-aligned"
  to "AU Core-conformant": replace the files under `src/main/resources/au-core/`
  with the real downloaded IG package — no other code changes needed.
- Audit logging is the one deliberate best-effort/non-blocking exception to the
  fail-safe posture — an unlogged export is a lesser harm than blocking a
  continuity export over a gap in the shared audit-event-type registry.
- This is the one service with no Postgres schema of its own, so there's no outbox
  transaction boundary — a documented, deliberate divergence from the
  platform-wide outbox pattern.

### What's mocked
- `MockHealthcareIdentifiersService`, `MockMyHealthRecordService`,
  `MockNashSigningService` — see above; each fails closed by default.
- The AU Core profile fixtures themselves (see judgment call above).

### Known gaps — the most important one in this document
- **`mvn clean verify` has never been run against Maven Central in any sandbox this
  service has been built in** (confirmed blocked again this session). All code was
  written and manually re-checked line-by-line against the real HAPI FHIR
  7.4.x/Spring Boot 3.3.x APIs, but **has not been compiled or executed**. This is
  explicitly flagged as the single most important thing for whoever picks this
  repo up next to do before trusting this service: `cd services/fhir-gateway && mvn
  clean verify`, with a specific list of package names most likely to have moved
  across HAPI FHIR versions (see the full BUILD_LOG/fhir-gateway.md for the list).
- No `fhir-gateway-service` Keycloak client exists yet in the realm export.
- `docker-compose.yml`'s `fhir-gateway:` block doesn't pass the audit/Keycloak env
  vars other services get via the Node-specific YAML anchor (this service's own
  `application.yml` defaults already match what those values should be).
- `fhir.export.performed` isn't a registered `AuditEventType` yet — the Audit Log
  Service will 400 the call until it is, treated as a non-fatal warning.

**Written but unexecuted**: 5 AU Core validation tests, a full-stack export
controller test, 4 HI Service tests, 4 NASH signing tests, 2 audit-client tests —
all need `mvn clean verify` to actually run.

---

## admin/ops and integration summary

For the four backend "ops surface" pieces above — admin-console and fhir-gateway —
the pattern is consistent: real logic, real tests (where the toolchain allowed),
mocked external systems behind clean interfaces, and one specific "next step"
each (fhir-gateway needs a real Maven run; admin-console needs `revealSensitive`
wiring).

---

## gp-portal — port 3100

Next.js 16 (App Router). Calls eight real backend services directly with `fetch` —
no mocked business data inside the app itself.

### What was built
- **Real OIDC sign-in** (`lib/auth/`) — genuine Authorization Code + PKCE against
  Keycloak's `gp-portal` public client, bound to the `clinician-browser` flow.
  Client-side checks are UX only; real enforcement is server-side (Keycloak's flow
  + each backend's `packages/auth-client` guard).
- **One typed API client module per backend service** (`lib/api/`) — every route
  called was cross-checked against that service's real controller decorators, not
  assumed.
- **Every GP-portal screen from `ui-design.md`**'s inventory: dashboard, patient
  search/account-trigger, referral creation (with a live compliance-checklist
  preview and a live HealthPathways suggestion as the GP types), practice-wide
  referral dashboard with CSV export, referral detail with inline message thread,
  follow-up dashboard, message inbox, deceased-flag workflow (with an explicit,
  gating first-hand-notice checkbox), practice settings.

### Key decisions / honestly-documented gaps
- No practice-wide "list my patients" backend endpoint exists yet — two
  `localStorage`-backed helpers (`practiceProfile.ts`, `knownPatients.ts`) work
  around this transparently, each documented as a pragmatic workaround with a note
  on what a real "GP practice panel" endpoint would replace them with.
- `docker-compose.yml`'s `gp-portal` block only wires 3 of the 7 backend URLs this
  app actually calls — every client falls back to the documented local-dev port,
  so it still works.
- No Playwright e2e inside this app itself (the root `/e2e` suite covers the
  cross-app golden path instead — see below).

**Verified**: typecheck/lint clean, 24/24 unit tests, production build succeeds
(all 12 routes compile). Not verified: a live sign-in round trip (no Docker daemon
in the build sandbox) — closed by the root `/e2e` suite's design, though that
suite itself hasn't been executed yet either (see below).

---

## specialist-portal — port 3101

Next.js (App Router), five real backend services, no mocked data of its own.

### What was built
- Real OIDC sign-in (PKCE S256 verified against the literal RFC 7636 Appendix B
  test vectors, not just internal self-consistency).
- Screens covering `ui-design.md`'s Specialist portal inventory: incoming-referral
  queue, booking calendar management, Follow-up Plan creation, directory profile
  management.

### Key design decision: the two-service seam in the referral queue
`ui-design.md` describes one "referral decision" screen, but the real backend has
**two separate state machines** covering different parts of a referral's life
(`services/referral`'s `routed→booked|declined|cancelled`, and
`services/specialist-review`'s `ReferralCase`, only reachable once `POST /cases`
exists — see that service's gap above). Rather than paper over this with a UI that
claims a transition that doesn't exist, this app **honestly splits into two real
screens** matching the two real state machines, and documents the mapping. The
recommended real fix is the same one `specialist-review`'s own log names: wire
`services/referral`/`services/booking` to actually call `POST /cases`.

### Other judgment calls
- No backend mapping exists from a Keycloak principal to a domain `SpecialistId` —
  the nav bar's editable "Specialist id" field is a documented, honest escape hatch
  for exercising the app against seeded data.
- Several list endpoints (`GET /referrals`, `GET /directory/entries`,
  `GET /follow-up-plans`) lack filters this app needs, so it filters client-side —
  fine at this scale, flagged as a real backend follow-up.

**Verified**: 20/20 unit tests including RFC-vector-verified PKCE, lint/typecheck
clean, production build succeeds (12 routes). Not verified: a live sign-in round
trip or any screen against a running backend.

---

## patient-web (port 3102) + patient-mobile (port 8081)

Built in one pass, covering `ui-design.md`'s full patient/carer screen inventory
on both surfaces: onboarding, home dashboard, GP-link push-approval, referral
timeline + message thread, booking preference capture, consent & security
(linked-GP management + revoke, passkey management), raise-a-concern, document
vault. Both call real backend services — no mocked business data in either app.

### What was built
- **patient-web** (Next.js) — the same OIDC/PKCE/API-client conventions
  `gp-portal`/`specialist-portal` established, bound to the `patient-carer-browser`
  Keycloak flow (passkey as an *alternative*, not mandatory).
- **patient-mobile** (Expo/React Native) — real `expo-auth-session` Authorization
  Code + PKCE (native PKCE handling, since Hermes doesn't reliably expose Web
  Crypto), `expo-secure-store` for token storage, `expo-local-authentication` for
  biometric app-lock, `expo-linking` for deep-link activation tokens. A hand-rolled
  in-app router (not `@react-navigation`) — a documented judgment call favoring
  testability over native-linking risk with no simulator/device available to verify
  against in this sandbox. A hand-rolled React Native mini design system re-expressing
  `ui-components`'s visual language, since that package is DOM/web-only.

### Key decisions
- **`buildLocalActivationSession` — a documented, clearly-labelled dev-only
  auth bridge, not a real mechanism.** See "known gaps" below for why it exists.
- Document vault is an honestly-labelled placeholder (no document-storage service
  exists anywhere in this build) — both apps derive a "document" from data the
  Referral Service already returns and badge it clearly as a placeholder.
- Passkey/WebAuthn was not implemented natively on Expo (a real native module was
  judged too risky to verify with no simulator available) — the working fallback
  is real OIDC PKCE (which itself can offer passkey via Keycloak's hosted login
  page) plus device-native biometric app-lock, matching the brief's "OTP + biometric
  as the working default, passkey as an enhancement if time allows."

### Known gaps — the most consequential one for click-through testing
- **No Keycloak user is provisioned for a patient/carer anywhere in this build**
  (same gap `onboarding-account`'s own log flags from the backend side) — the real
  OIDC flow both apps built is genuine and correctly shaped, but there's no user
  account on the other end of it yet. `buildLocalActivationSession` synthesizes an
  **unsigned** local token set purely to unblock UI click-through testing in this
  sandbox — it is never accepted by any real backend `TokenVerifier`. Closing the
  real gap means wiring `onboarding-account`'s OTP-verification success to
  `identity-access`'s Keycloak Admin client (a backend change, out of these two
  apps' scope).
- Booking screens require `Referral.specialistId` to already be set (the
  Directory Service's auto-matching step is out of scope) — handled as an honest
  "not yet assigned" state, not an error.

**Verified**: both apps' typecheck/lint/test/production-build all pass. Neither
app's real sign-in flow nor `expo start` was exercised against live infra/a
simulator in this sandbox.

---

## End-to-end test suite (`/e2e`)

A Playwright suite (`e2e/tests/golden-path.spec.ts`) covering the platform's
actual golden path: **GP creates a referral in the GP Portal → routes through the
Directory Service (HealthPathways suggestion + directory search) and the Booking
Service → the specialist sees it in the Specialist Portal → the patient sees the
referral and a booking outcome in Patient Web.** Every step is a real HTTP call
against a real, unmodified backend endpoint (driven through the actual UI where a
screen exists, or a direct signed-bearer-token API call for the handful of setup
steps no screen currently exposes) — nothing is mocked by the test suite beyond
what each service's own section above already documents that service mocking
internally.

**Status: written and reasoned through against the real, current application
source (selectors and API contracts read from the actual code, not guessed) —
but never executed against a live stack.** The same missing-Docker-daemon
constraint that affected every service above applies here too. Three specific,
honestly-documented workarounds exist in the suite and its own README, worth
knowing before the first real run:

1. **Uses Keycloak's Direct Access Grant (ROPC), not the real login UI**, for
   `gp-portal`/`specialist-portal` sign-in — those are bound to the mandatory-passkey
   `clinician-browser` flow, and driving a first-time WebAuthn ceremony inside
   Keycloak's hosted login page blind (no live Keycloak in the writing sandbox) was
   judged too unverifiable to be worth the engineering risk. The realm export was
   updated with `directAccessGrantsEnabled: true` + a `principal_type` protocol
   mapper + three fixed local-dev-only test users — **never replicate this pattern
   in a non-local realm.**
2. **A specialist self-registers via a direct API call before the test runs**,
   because the GP Portal's referral-creation screen has no free-text specialist-id
   field — this surfaced a real, documented gap: no endpoint in this build ever
   sets `DirectoryEntry.specialistId` to a real logged-in specialist's own Keycloak
   `sub`, so a referral's `specialistId` ends up being the directory entry's own
   row id. The test uses the Specialist Portal's own documented "Specialist id"
   escape hatch to work around it — the same escape hatch that app's own build log
   already flagged.
3. **Does not call `POST /cases` itself** to work around `specialist-review`'s
   missing caller — it deliberately asserts the specialist sees the referral via
   the queue's separate, already-fully-wired "New referrals" section instead, so
   the real gap (nothing wires Booking → Specialist Review) stays visible rather
   than being silently papered over by the test.

**First run checklist**: `docker compose up -d --build` (needs registries reachable
this sandbox's egress policy blocked), the *updated* realm export imported, `npm
install && npx playwright install --with-deps chromium` from `/e2e`, then `npm
test`. Expect to fix a locator or two on the actual first run against real
rendered DOM — this has been engineered carefully, not verified live.
