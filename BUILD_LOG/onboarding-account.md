# BUILD_LOG: onboarding-account-service

2026-08-13 — initial real implementation (previously scaffold-only).

## What was built

### 1. `src/onboarding` — the patient/carer onboarding flow

The full flow from `identity-security-recommendations.md` §3, end to end:

- `POST /account-activation-requests` — a verified GP practice triggers a
  new-account request. Enforces `assertVerifiedPractice()` (the practice's
  HPI-O must belong to a `GpPractice` row that is `verified` and has
  acknowledged the compliance checklist — closes the "fake GP practice"
  fraud surface per `onboarding-processes.md`) and per-GP/per-mobile-number
  rate limiting (`identity-security-recommendations.md` §5). Resolves the
  patient's IHI via the (mocked) Healthcare Identifiers Service and
  deduplicates on it — an existing `active` account is rejected (points the
  caller at GP Authorisation Service instead), an existing
  `pending_activation` account is reused (the legitimate "GP resends after
  the 2-day queue lapsed" case), a `frozen_deceased`/`suspended` account is
  rejected.
- `POST /account-activation/:token/verify-identity` — DOB (+ Medicare
  number, if the GP captured one) shared-secret verification, with a
  5-attempt lockout.
- `POST /account-activation/:token/branch` — the neutral "is this for you,
  or are you helping someone else?" question. Patient branch: OTP goes to
  the patient's own email. Carer branch: captures name/email/relationship/
  own-mobile-number-or-shared, creates a `Carer` row at `nominated_delegate`
  tier only (elevation to `authorised_representative` is the Consent &
  Security Service's job, out of this service's scope — see
  identity-security-recommendations.md §2), and flags
  `suspectedOrganisationalCarer` when the same carer email/mobile has
  already appeared as carer for ≥2 other patients (the aged-care bulk-carer
  pattern, §5) — flagged only, not blocked; a full organisational-carer
  verification flow is out of scope here.
- `POST /account-activation/:token/otp/verify` and `/otp/resend` — 6-digit
  OTP, HMAC-SHA256 hashed at rest (never the raw code), 10-minute expiry,
  5-attempt lockout, resend rate-limited. On success: activates the
  `Patient` row, marks the carer's email verified (if carer branch), and
  best-effort prompts passkey enrolment via `IdentityAccessClient` (see
  "Known gaps" — this call is a documented no-op today).
- **Minors**: if the patient is recorded as a minor (age < 18 at request
  time), the "it's me" branch is rejected — a parent/guardian must complete
  the carer branch instead. This is a partial, documented fill of the "minors
  as primary patients" gap `minors-multigp-exception-paths.md` explicitly
  flags as "hasn't been designed at all" — not a full solution (no distinct
  minor account model, no age-18 transition workflow).

**Judgment call — email replaces SMS for the entire flow, not just the OTP.**
`modules-and-requirements.md` says only the OTP swaps to email for this
build ("production design remains SMS ... for this build ... email
instead"). But `docker-compose.yml`'s `onboarding-account:` block only
configures `SMTP_HOST`/`SMTP_PORT` (no `SMS_PROVIDER` var, unlike
`notification:`), and the task brief for this service explicitly says
"email-based activation link since no SMS budget" — so this build sends
**both** the initial activation link and the OTP by email, requiring
`patientEmail` in `CreateActivationRequestDto` (an email address the GP
practice has on file for the patient, alongside the mobile number). This
doesn't weaken the actual security property: the DOB/Medicare shared-secret
verification step — not which channel carried the link — is what binds
whoever clicks the link to the real patient record. Documented in the DTO's
own doc comment and `.env.example`.

**Judgment call — one combined OTP, not two separate carer-verification
channels.** `identity-security-recommendations.md` §3 step 6 describes
verifying a carer's email via "a separate link" (independent of the
patient's own SMS-bound OTP). Since this build is already all-email, a
second, separate email verification to the same address the OTP already
goes to would add friction without a real security benefit — so one OTP
email serves as both carer email verification and account activation.
Documented in `prisma/schema.prisma`'s `OtpChallenge.purpose` comment.

### 2. `src/gp-practices` — GP practice onboarding

`POST /gp-practices` (HPI-O verification via the mocked HI Service, records
`verificationStatus`), `GET /gp-practices/:id`, `POST
/gp-practices/:id/compliance-checklist/acknowledge`. Feeds directly into
`onboarding.service.ts`'s `assertVerifiedPractice()` gate.

### 3. `src/specialists` — specialist onboarding

`POST /specialists` runs the full chain in one request — AHPRA registration
check → HPI-I resolution → NASH credential provisioning → Directory Service
profile creation — recording each step's outcome on the `Specialist` row
rather than silently swallowing a partial failure. Stops early (records
`ahpraVerificationStatus: 'failed'`, does not proceed) if AHPRA verification
fails, since HPI-I/NASH/directory listing all presuppose a currently
registered practitioner. `POST /specialists/:id/econsult-opt-in` — a
genuinely separate decision from taking bookings, per
`onboarding-processes.md` step 6.

### 4. MOCK integrations — every one behind a clean interface

- **`src/hi-service`** — `HiServiceClient` abstract class /
  `MockHiServiceClient`. Covers all three Healthcare Identifiers Service
  functions this build needs: `resolveIhi` (patient dedup key),
  `verifyHpio` (GP practice), `resolveHpii` (specialist). **Deterministic**
  (same input → same identifier, via SHA-256 + a hand-rolled mod-10 check
  digit — not the HI Service's real, undisclosed algorithm) so dedup logic
  has something real to test against rather than a random UUID per call.
  Uses the real public HI issuer prefixes (`800360`/`800362`/`800361`) so
  output *looks* like a real identifier; nothing is registered against any
  real HI Service record.
- **`src/ahpra`** — `AhpraVerificationClient` / `MockAhpraVerificationClient`.
  Format-validates AHPRA numbers against the real 3-letter profession-code
  scheme; deterministically assigns a specialty. A reserved all-zero numeric
  body (`MED0000000000`) is a documented test fixture for "not currently
  registered."
- **`src/nash`** — `NashCredentialClient` / `MockNashCredentialClient`. No
  real NASH sandbox credentials exist for this build; issues a random
  credential id only, never real key material (real key material would need
  an HSM or equivalent, never this service's own Postgres schema).
- **`src/directory-client`** — **not a mock** — a real HTTP client calling
  `services/directory`. That service is scaffold-only as of this build (no
  receiving endpoint), so every call fails and degrades gracefully to
  `directoryProfileStatus: 'pending_directory_service'` rather than failing
  specialist onboarding. Retryable once Directory Service is real.
- **`src/identity-access-client`** — **documented cross-service gap, not a
  mock**. The real target endpoint
  (`services/identity-access`'s `POST /passkeys/require-reenrolment`) exists
  and works, but is deliberately scoped to the *caller's own* account (reads
  the target user id from the verified bearer token's `sub` claim, not a
  request body) — the right posture for that endpoint, but it means this
  service (acting on behalf of a just-activated patient/carer with no
  browser session) can't call it with a plain service-to-service token. See
  that file's extensive doc comment for the two real fixes (a scoped
  internal endpoint, or setting the required action at Keycloak user
  provisioning time) — both are additive changes to
  `services/identity-access`, out of this agent's scope. The call is
  best-effort today: it never blocks activation, and starts working the
  moment the gap is closed on the other side.

### 5. `src/audit-outbox` — the outbox pattern, for real, for the first time in this repo

Root `CONVENTIONS.md` §7 documents the required outbox pattern (a DB row in
the same transaction as the domain write, relayed by a background job) but
no other service built so far actually implemented the relay half —
`identity-access` used the direct-call pattern for its (non-clinical) IAM
events instead. This build implements both halves for real:

- `AuditOutboxService.enqueue(writer, input)` — takes either `this.prisma`
  or a `tx` from `prisma.$transaction(async (tx) => ...)`, so the audit row
  and the domain write it documents share one transactional boundary.
- `AuditOutboxRelayService` — a `@nestjs/schedule` `@Interval(5000)` job
  (added `@nestjs/schedule` as a new dependency for this service) that polls
  unpublished rows, calls the real `AuditClient.record()`, and marks each
  published on success — or records `attempts`/`lastError` and retries next
  tick on failure (nothing is ever dropped short of a human decision, up to
  a documented `MAX_ATTEMPTS` cap that still stops querying, not deleting,
  a row). Guards against overlapping ticks if the Audit Log Service is slow.

**Every account-lifecycle write in this service goes through this** — GP
practice registration/verification, specialist registration/AHPRA/HPI-I/
NASH/directory outcomes, patient creation, identity verification outcomes,
carer registration, OTP outcomes, and account activation itself.

**`packages/shared-types`' `AuditEventType` union already covers several of
this service's events** (`account.activation.requested`,
`account.activated`, `carer.registered`, `carer.reattested`) — used
directly. For the rest (identity-verification/OTP outcomes, GP-practice and
specialist onboarding lifecycle events), following the exact pattern
`services/identity-access` already established for the same class of gap:
`src/common/audit/onboarding-audit-events.ts` defines local
`OnboardingAuditEventType` constants, and `AuditOutboxService`'s input type
accepts either union rather than casting at every call site. `packages/
shared-types` is outside this agent's scope (`services/onboarding-account`
only) — the shared-types maintainer should fold these into the real union
next time that package is touched.

## Key decisions / judgment calls

1. **Email replaces SMS end-to-end, not just for the OTP** — see above.
2. **One combined carer-email-verification + activation OTP** — see above.
3. **Minors are partially handled** (blocked from the "it's me" branch) but
   the full minors-as-primary-patients design (a distinct account model,
   age-18 transition) remains an open gap per
   `minors-multigp-exception-paths.md` — not attempted here, scope was kept
   to "don't let a 10-year-old self-activate an account."
4. **Sensitive-category access grants and authorised_representative
   elevation are NOT implemented here** — `identity-security-recommendations.md`
   §2 and §4 describe both, but `modules-and-requirements.md` assigns "the
   consent page" (module 4, Consent & Security Service) as the home for
   both. This service creates carers at `nominated_delegate` tier only and
   leaves `sensitiveCategoryAccessGrantedAt` unset — a deliberate service
   boundary, not an oversight.
5. **The GP-triggering endpoint (`POST /account-activation-requests`) is not
   yet behind `requireAuth`** — `assertVerifiedPractice()` provides a real,
   enforced authorisation check (the HPI-O must belong to a verified,
   compliance-acknowledged practice), but doesn't yet verify the *caller* is
   that practice's own system. Documented in `onboarding.controller.ts`'s
   doc comment — deferred pending the GP Authorisation Service's own
   practice-system auth wiring, since the two are closely related and adding
   it here first risked diverging from whatever pattern that service lands
   on.
6. **No real Keycloak user is provisioned for a newly activated patient/
   carer anywhere in this build.** `IdentityAccessClient.promptPasskeyEnrolment`
   is called with this service's own `Patient`/`Carer` id as a placeholder
   "Keycloak user id" — genuinely a no-op pending both this gap and gap #7
   below being closed together. Who owns Keycloak user creation for
   patients/carers (this service, or `identity-access`, or a shared flow) is
   an open design question worth resolving explicitly rather than guessing
   at from here.
7. **Followed `services/identity-access`'s exact prior-art for two
   structural problems it already solved**: (a) extending `AuditEventType`
   locally via a cast-at-the-boundary pattern rather than editing
   `packages/shared-types`, and (b) the `prisma generate`-blocked-by-sandbox
   workaround (hand-written migration SQL + a local, non-committed
   `node_modules/.prisma/client` stub) — see "Known gaps" below.

## What's mocked

- **`src/hi-service`** (IHI/HPI-O/HPI-I resolution) — MOCK, deterministic,
  clearly labelled in every file. Real integration needs a NASH PKI
  certificate + Services Australia HI Service registration, and per
  `claude/modules-and-requirements.md` should likely go through
  `services/fhir-gateway` rather than a direct client here.
- **`src/ahpra`** (AHPRA registration check) — MOCK. AHPRA's real public
  register has no bulk API; a real integration is more likely a
  rate-limited on-demand lookup than a REST client.
- **`src/nash`** (NASH credential provisioning) — MOCK. No sandbox NASH
  environment exists for this build.
- **`src/directory-client`** — real HTTP client, not a mock, but its target
  endpoint doesn't exist on `services/directory` yet (see above).
- **`src/identity-access-client`** — real HTTP client, not a mock, but its
  target endpoint doesn't exist on `services/identity-access` yet in the
  shape this caller needs (see above).

## Known gaps / incomplete

- **`prisma generate` could not be run in this sandbox** — same
  `binaries.prisma.sh` 403 (policy denial) `services/identity-access` hit.
  `prisma/migrations/20260813120000_init/migration.sql` was hand-written to
  match `prisma/schema.prisma` (standard Prisma-generated SQL shape); not
  applied against a real Postgres or diffed against a real `prisma migrate
  dev` run — verify with `npm run prisma:migrate -w services/onboarding-account
  -- --name init` once network access is available. A minimal hand-written
  stub was placed at `node_modules/.prisma/client/` (NOT part of the repo —
  gitignored, purely a local sandbox verification aid, and shared/hoisted
  across every service in this npm workspace — whichever service's schema it
  was last written against is the one it reflects) implementing just enough
  of `PrismaClient`'s shape for this service's real code to compile and its
  71 unit tests (which use an in-memory fake `PrismaService` or plain mocks,
  not this stub, for actual behaviour) plus the full `AppModule` DI graph
  (`test/health.e2e-spec.ts`) to run. **Run `npm run prisma:generate -w
  services/onboarding-account` for real** the first time this service is
  built somewhere with network access.
- **`POST /account-activation-requests` isn't behind `requireAuth`** — see
  judgment call #5 above.
- **No Keycloak user provisioning for patients/carers** — see judgment call
  #6. `IdentityAccessClient`'s passkey-enrolment prompt is consequently a
  documented no-op end to end today.
- **Directory Service profile creation** degrades gracefully but has no
  retry/reconciliation job yet — a specialist stuck at
  `directoryProfileStatus: 'pending_directory_service'` needs either a cron
  retry or an admin-console action once Directory Service is real.
- **Rate limiting is DB-query-based, not Redis-based** — `REDIS_URL` is
  configured (per the service template) but unused; per-GP/per-mobile/
  per-OTP-resend limits are enforced via `count()` queries against recent
  rows instead. Simpler to reason about and test without a Redis dependency
  at this scale; revisit if these queries become a hot path under real load.
- **The 2-day activation queue's "then delete" half isn't implemented
  here** — this service sets `queueExpiresAt` on `AccountActivationRequest`
  and exposes it in API responses, but the actual referral queueing/deletion
  at that boundary is the Referral Service's job per
  `modules-and-requirements.md` (module 5); no cron job in this service
  deletes anything.
- **GP practice / specialist deletion, editing, and duplicate-HPI-O/AHPRA
  re-registration-after-failure flows are not built** — only create +
  (for GP practices) compliance-checklist acknowledgement +
  (for specialists) e-consult opt-in.

## How to run/test this service in isolation

```bash
# from the monorepo root
npm install
cp services/onboarding-account/.env.example services/onboarding-account/.env

# unit tests — no external dependencies required, all 71 pass in this sandbox
npm run test -w services/onboarding-account

# typecheck / lint / build — all clean in this sandbox
npm run typecheck -w services/onboarding-account
npm run lint -w services/onboarding-account
npm run build -w services/onboarding-account

# e2e — test/health.e2e-spec.ts boots the full AppModule; passes in this
# sandbox with a copied .env (PrismaService.$connect is a no-op against the
# local stub client, and Keycloak/service-token calls are never made just
# from booting) — confirms the whole DI graph wires up cleanly end to end.
# In a real environment, start real infra first:
docker compose up -d postgres redis keycloak mailhog
npm run prisma:migrate -w services/onboarding-account -- --name init
npm run test:e2e -w services/onboarding-account

npm run start:dev -w services/onboarding-account   # -> http://localhost:3002/health
```

**Manually exercised in this sandbox**: the full onboarding golden path
(GP-triggers → DOB verify → branch → OTP → activation, both the patient and
carer branches, plus lockout/expiry/rate-limit edge cases) via
`src/onboarding/onboarding.service.spec.ts`'s 16 tests, run against a
purpose-built in-memory fake of the Prisma models involved (real filtering,
real relations, real Prisma-schema-default reproduction) rather than
canned per-call mocks — chosen because this service's value is almost
entirely in its branching/state-transition logic, which canned mocks don't
exercise. The GP-practice and specialist onboarding chains
(AHPRA → HPI-I → NASH → directory sequencing, including the
directory-unreachable degrade-gracefully path) are covered similarly in
their own service spec files. Email sending is verified against a mocked
`nodemailer.createTransport`/`sendMail` (not a live Mailhog instance in this
sandbox — no Docker daemon available here, same constraint every other
service in this build has hit); wire it up for real with `docker compose up
-d mailhog` and check `http://localhost:8025` for real end-to-end delivery.
