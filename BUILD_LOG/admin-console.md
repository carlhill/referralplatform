# BUILD_LOG: admin-console-service

2026-08-13 — initial real implementation (previously scaffold-only, though the
scaffold for this service was unusually advanced already — see "What existed
before this pass" below).

## What existed before this pass

Unlike most services' scaffold, admin-console's scaffold phase had already
written the full Prisma schema (`VerificationCase`, `PracticeOnboardingCase`,
`AuditOutbox` models, with detailed design-rationale doc comments), plus
`src/common/consent-security.client.ts`, `src/common/onboarding-account.client.ts`,
`src/common/staff.ts`, `src/common/step-up.ts`, and
`src/audit-outbox/outbox-writer.ts` — real, working code, not stubs. This pass
built the four feature modules those pieces were designed to support (none of
them existed yet), wired them into `app.module.ts`, and added the outbox relay.
Nothing from the pre-existing scaffold was changed except `app.module.ts`
(wiring) and `package.json`/`.env.example` (added `@nestjs/schedule` and two
downstream service URLs + `STEP_UP_ACR`).

## What was built

Four bounded-concern modules, matching `ui-design.md`'s "Admin/Ops Console
(internal staff)" screen inventory exactly:

### 1. `src/verification-cases` — AHPRA/WWCC manual verification review queue

- Owns its data outright (`VerificationCase`) — neither onboarding-account
  (which does the automated AHPRA/HPI-O checks) nor any other service
  exposes a "pending manual review" queue, and WWCC has no automated
  national check at all (`minors-multigp-exception-paths.md`'s recommendation:
  capture the check number + issuing state, manually verify against the
  issuing state's own portal).
- `open()` best-effort snapshots the live automated status from
  onboarding-account immediately (`refresh()`, called internally) — a failed
  snapshot (source service down, or a `wwcc` case with no source record)
  never blocks opening the case.
- `refresh()` is read-only: it never changes `status`, only
  `lastKnownAutomatedStatus`/`lastKnownAutomatedDetail`/`lastRefreshedAt`.
  Deciding a case is exclusively `approve()`/`reject()`/`needsInfo()` —
  staff-only, step-up gated for approve/reject (root `CONVENTIONS.md` §8
  names "approving a new GP link" / "granting deceased-patient access" as
  the worked step-up examples; approving/rejecting a professional
  registration check is an equally sensitive decision this console exposes
  directly).
- A case can only be decided once — `approve()`/`reject()` throw
  `ConflictException` on an already-`approved`/`rejected` case, mirroring
  consent-security's `AccessRequestsService.decide()` pattern exactly.
  `needsInfo()` is not terminal — a case can move `open → needs_info →
  approved/rejected`.
- Every decision (`opened`, `approved`, `rejected`, `needs_info`) goes
  through the outbox pattern.

### 2. `src/practice-onboarding` — PHN/practice onboarding pipeline

- Owns its own pipeline-stage-tracking record (`PracticeOnboardingCase`),
  linked to onboarding-account's real `GpPractice.id` once one exists
  (`gpPracticeId`, nullable while still a pre-registration lead —
  onboarding-account's own `GpPractice` model has no concept of a lead that
  hasn't registered yet).
- `pipeline-stage.ts` is a real, enforced state machine (10 stages: `lead →
  contacted → registered → hpio_verification_pending → hpio_verified →
  compliance_checklist_pending → compliance_checklist_acknowledged → live`,
  plus the `hpio_verification_failed` retry branch and a `stalled` diversion
  reachable from any non-terminal stage, resumable back to `contacted`).
  `advanceStage()` rejects any transition outside this graph with a
  `BadRequestException` that names the actually-allowed next stage(s) —
  deliberately, since this is a staff tool and the error message doubles as
  UI guidance.
- **Documented judgment call**: `live` is terminal in this model — taking a
  live practice offline again is treated as an operational action outside
  this pipeline-tracking tool's scope, not a stage transition. If that's
  wrong once a real "suspend a live practice" need shows up, add a `live →
  stalled` edge to `pipeline-stage.ts`'s transition table; it's an additive
  change.
- `refresh()` pulls HPI-O verification status and compliance-checklist
  acknowledgement timestamp from onboarding-account once `gpPracticeId` is
  set; a no-op for a lead.

### 3. `src/deceased-access-requests` — deceased-patient access-request review

- **Deliberately not a reimplementation.** consent-security already owns a
  complete, real, human-reviewed executor/family/coroner access-request
  workflow (`services/consent-security/src/deceased/access-requests.*`),
  including its own staff guard and step-up-gated approve action. This
  module is a thin, real HTTP proxy (`ConsentSecurityClient`, already
  written by the scaffold phase) that forwards the caller's own bearer
  token unchanged, so consent-security's own auth/step-up checks apply to
  the real request — not a locally-cached copy that could drift from the
  authoritative workflow.
- This controller still runs its own `requireStaff`/`assertStepUp` checks
  before forwarding (defense in depth — reject an obviously-unauthorised
  caller at this console's own edge) but that is explicitly **not** a
  substitute for consent-security's own enforcement on the forwarded
  request, which still applies unchanged.
- No local Prisma model, no outbox writes — nothing here is a system of
  record; the audit trail for a decision is written by consent-security
  itself when it processes the forwarded approve/deny call.

### 4. `src/audit-log-query` — audit-log query tool

- A thin wrapper over `@referralplatform/audit-client`'s read-side calls
  (`listForSubject`/`getEvent`/`verify`) against the real Audit Log
  Service — this console never talks to immudb or Postgres directly (only
  the Audit Log Service does, per `audit-log-architecture-decision.md`),
  and never writes an audit entry through this module (read-only by
  design — writes from this service go through the outbox pattern in the
  other three modules).
- `verify()` re-checks the immudb inclusion proof *and* the NASH signature
  independently on every call, per `audit-log-architecture-decision.md`'s
  "regulators/auditors need the ability to independently verify... rather
  than trusting the platform's word for it" — this console never caches or
  trusts a previously-seen `valid: true`.
- **Known gap**: `revealSensitive=true` (to unmask crypto-shredded payload
  fields for an authorised staff investigation) is not exposed here. The
  Audit Log Service's own endpoint requires an `internal_staff`-rolled
  bearer token for that flag, but this service authenticates to it as a
  *service* principal (`ServiceTokenProvider` client-credentials token, per
  root CONVENTIONS.md §8), which has no `internal_staff` role — so
  `revealSensitive=true` would be rejected regardless of who's actually
  calling this console today. Fix: either forward the caller's own bearer
  token to the Audit Log Service (matching the consent-security/
  onboarding-account proxy pattern used elsewhere in this service) or issue
  a dedicated internal-staff-scoped service credential. Neither is
  implemented; this endpoint set only ever returns the non-sensitive
  envelope.

### 5. `src/audit-outbox` — the relay half of the outbox pattern

Added `AuditOutboxRelayService` (identical pattern to
`services/referral/src/audit-outbox` and
`services/consent-security/src/audit-outbox` — a `@nestjs/schedule`
`@Interval(5000)` job draining unpublished `AuditOutbox` rows to the real
Audit Log Service) since the scaffold had written `outbox-writer.ts` (the
write half) but not the relay. Wired `ScheduleModule.forRoot()` into
`app.module.ts` to power it. On a relay failure, increments `attempts` and
records `lastError` on the row (fields the scaffold's schema already had)
before retrying next tick — a small addition beyond referral/consent-security's
relay, which don't currently persist that detail.

## Key decisions / judgment calls

1. **`src/common/external-clients.module.ts` (new, `@Global`)** — the
   scaffold's `OnboardingAccountClient`/`ConsentSecurityClient` were written
   as plain `@Injectable()` classes with no module declaring them as
   providers yet. Rather than redeclaring both in every feature module that
   needs one (duplicating `ServiceTokenProvider` token caches per module for
   `OnboardingAccountClient`), added one small global module providing a
   single shared instance of each, imported once in `app.module.ts`.
2. **Audit event types are not yet in `shared-types`** — same documented gap
   the scaffold's own `outbox-writer.ts` doc comment already flags
   (`AdminConsoleEventType` is a local supplement, cast to `AuditEventType`
   only at the network boundary in the relay). Recommended fix for whoever
   next touches `packages/shared-types`: append
   `'verification_case.opened' | 'verification_case.approved' |
   'verification_case.rejected' | 'verification_case.needs_info' |
   'practice_onboarding_case.opened' | 'practice_onboarding_case.stage_advanced'`
   to `AuditEventType` (append-only).
3. **`onboarding-account` has no list/discovery endpoint** (already flagged
   by the scaffold's `onboarding-account.client.ts` doc comment) — staff
   open a `VerificationCase`/`PracticeOnboardingCase` using an identifier
   they already have (support ticket, an `ahpra_verification_failed`/
   `hpio_verification_failed` audit event they were alerted to
   out-of-band), not by browsing a queue this console itself populates.
   Genuinely out of this task's scope to fix (onboarding-account is a
   different agent's scope).
4. **`live` is a terminal pipeline stage** — see item 2 in the
   practice-onboarding write-up above.

## What's mocked / interim

Nothing new in this pass introduces a mock external-system integration —
this service only calls other ReferralPlatform services (onboarding-account,
consent-security, the Audit Log Service), all real HTTP calls with real
service-to-service or forwarded-bearer auth. The only "mock" surface is
inherited transitively: onboarding-account's own AHPRA/HPI-O automated
checks and the Audit Log Service's NASH signer are documented as MOCK in
their own BUILD_LOGs — this console just displays/relays whatever those
services report, honestly, without pretending the underlying check is real.

## Known gaps

- `revealSensitive` not wired through `audit-log-query` (see module 4 above).
- No manual-override endpoint on onboarding-account for
  `VerificationCasesService.approve()` to call to actually flip the
  specialist's/practice's own verification flag after a manual approval —
  today, approving a `VerificationCase` records the staff decision and
  audits it, but doesn't yet push that outcome back to unblock whatever the
  automated check was blocking on onboarding-account's side. The doc
  comment in `onboarding-account.client.ts` (written by the scaffold phase)
  already names this as the natural next step once onboarding-account
  exposes such an endpoint.
- No pagination on any `list`/`GET` endpoint — acceptable at pilot scale
  (a handful of PHNs, an internal ops team), a real gap at real scale.
- `assign()` on both verification-cases and practice-onboarding takes a
  bare `staffId` string with no validation that it's a real internal-staff
  user id (Identity & Access Service has no "list internal staff" endpoint
  to validate against yet either).

## Verified

- `npm run test -w services/admin-console` — 6 suites, 28 tests, all
  passing (`verification-cases.service.spec.ts`,
  `practice-onboarding.service.spec.ts`, `pipeline-stage.spec.ts`,
  `deceased-access-requests.controller.spec.ts`,
  `audit-log-query.controller.spec.ts`, plus the pre-existing
  `health.controller.spec.ts`).
- `npm run lint -w services/admin-console` — clean, zero warnings.
- `npm run typecheck -w services/admin-console` / `npm run build -w
  services/admin-console` / `npm run test:e2e -w services/admin-console` —
  **fail in this sandbox**, but confirmed this is the identical pre-existing
  repo-wide gap already documented in `BUILD_LOG/audit-log.md` and this
  service's own `test/stubs/prisma-client.stub.ts`: `prisma generate` can't
  reach `binaries.prisma.sh` from this sandbox, so the real
  `@prisma/client` has no generated model delegates
  (`prisma.verificationCase`, `prisma.practiceOnboardingCase`, etc.) for
  `tsc` to type-check against. Confirmed identical failures exist today in
  `services/referral` (`npm run build -w services/referral`) and other
  already-merged services for the same root cause — this is not specific
  to this pass's code. Everything will type-check and build cleanly once
  `npm run prisma:migrate -w services/admin-console` runs somewhere with
  real network access to generate the real client. Unit tests avoid this
  entirely (`jest.config.js`'s `moduleNameMapper` swaps in the sandbox-only
  stub, and every service under test is exercised through a hand-rolled
  fake Prisma object shaped like the real calls, not the generated client).
- Did not attempt `docker compose up` / a live Postgres connection in this
  sandbox (Docker Hub/Postgres not verified reachable here either, per the
  scaffold's own README note) — the hand-authored `migration.sql` (already
  present from the scaffold phase) is written to be byte-for-byte what
  `prisma migrate dev` would generate for `schema.prisma`, so applying it
  directly (`psql ... -f migration.sql`) should unblock local development
  in a normal environment with real network access.

## How to run/test this service in isolation

```bash
# from the monorepo root
npm install
cp services/admin-console/.env.example services/admin-console/.env
docker compose up -d postgres redis keycloak

# apply the migration (real network access to binaries.prisma.sh required
# for `prisma migrate dev`; the committed migration.sql is a ready-to-apply
# fallback — see "Verified" above):
npm run prisma:migrate -w services/admin-console -- --name init
# or: psql "$DATABASE_URL" -f services/admin-console/prisma/migrations/20260813170000_init/migration.sql

npm run start:dev -w services/admin-console
# -> http://localhost:3011/health

npm run test -w services/admin-console       # unit tests — no DB/network needed
npm run test:e2e -w services/admin-console   # boots the real Nest app — needs a working Prisma client
```

See `services/admin-console/README.md` for the full endpoint table.
