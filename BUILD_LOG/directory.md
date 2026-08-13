# Directory Service + Secure Messaging Gateway — build log

Scope: `services/directory` only. Builds module 7 (Directory Service) and
module 8 (Secure Messaging Gateway) of `claude/modules-and-requirements.md`,
stamped from the shared NestJS service template per root `CONVENTIONS.md`.

## What was built

### Structural choice: one service, two modules

Directory Service and Secure Messaging Gateway are two conceptually
distinct modules in `modules-and-requirements.md` (7 and 8), but this build
puts both inside `services/directory` as two Nest modules
(`DirectoryModule`, `SecureMessagingModule`) sharing one Postgres schema and
one deployable, rather than splitting them into two services. Reasoning:

- Every Secure Messaging routing decision reads the `DirectoryEntry` table
  directly (is this specialist onboarded for direct delivery? which vendor
  endpoint?) — splitting them into two services would mean an extra
  network hop (and an extra service-to-service auth call) on every single
  referral routed, for no real isolation benefit at this build's scale.
- The task brief itself frames this as one unit of work ("Build the
  Directory Service AND Secure Messaging Gateway... put both inside
  services/directory as sub-modules, or split — document your choice").
- If real-world load or team ownership ever demands independent scaling/
  deployment, splitting is mechanical: move `src/secure-messaging/**` and
  its `RoutingAttempt`/its share of `AuditOutbox` into a new
  `services/secure-messaging-gateway` workspace, and change
  `DirectoryEntry` lookups from an in-process Prisma call to an HTTP call
  against the (already public) `GET /directory/entries/:id` endpoint.

### Directory Service (`src/directory/`)

- **Prisma model** `DirectoryEntry` — mirrors
  `@referralplatform/shared-types`' `DirectoryEntry` interface exactly
  (`hpiI`, `source`, `selfRegisteredOverride`, `practiceLocations` JSON,
  `consultingDays`, `econsultOptIn`, `acceptsBookingsViaPlatform`), plus
  Secure Messaging Gateway routing fields
  (`onboardedForDirectDelivery`, `secureMessagingVendor`,
  `secureMessagingEndpointId`) since routing decisions are keyed off the
  same specialist record. `hpiI` is the unique dedup key across NHSD-synced
  and self-registered records for the same practitioner.
- **NHSD sync** (`nhsd-sync/`): `NHSD_DIRECTORY_CLIENT` interface +
  `MockNhsdDirectoryClient` — **MOCK, clearly labelled** — returns 12
  realistic Australian specialists across common referral subspecialties
  (Cardiology, Dermatology, Endocrinology, ENT, Gastroenterology,
  Neurology, Orthopaedics, Psychiatry, Rheumatology, Respiratory,
  General Surgery, Paediatrics), spread across all 8 states/territories.
  `NhsdSyncService` runs daily via `@nestjs/schedule` cron
  (`EVERY_DAY_AT_2AM`) and is also directly callable
  (`POST /directory/sync/trigger`). **Idempotent** — upsert keyed on the
  schema's unique `hpiI`. **Self-registration always wins** — an entry with
  `selfRegisteredOverride = true` is left completely untouched by sync
  (not even `lastSyncedAt` is bumped); see the judgment call documented in
  that file's doc comment on why "skip entirely" was chosen over a
  field-level merge (no field-level provenance model exists in this build,
  and a partial merge risks silently overwriting a specialist's deliberate
  edit with stale synced data).
- **HealthPathways** (`healthpathways/`): `HEALTHPATHWAYS_CLIENT` interface
  + `MockHealthPathwaysClient` — **MOCK, clearly labelled** — keyword-matches
  a free-text referral reason to a specialist type/subspecialty/pathway URL
  using `static-pathway-links.ts`'s table (11 categories + a general
  fallback). Simulates the "Phase 2 inline guidance not available for a
  given PHN region" case explicitly named in
  `modules-and-requirements.md` via `HEALTHPATHWAYS_UNAVAILABLE_PHNS` (env
  var, comma-separated PHN codes) — when unavailable, throws
  `HealthPathwaysUnavailableError`, and `DirectoryService.suggestPathway`
  catches it and **degrades gracefully to the same static link table**
  (lower, fixed confidence, `source: 'static_fallback'`) rather than
  surfacing a 5xx to the GP. `GET /directory/pathway-suggestion` also
  resolves matching `DirectoryEntry` rows for the suggested subspecialty so
  a caller can go straight from "suggested pathway" to "pick a specialist."
- **Self-registered profile management**:
  `PUT /directory/entries/self` (`RegisterProfileDto`, validated with
  `class-validator`/nested `PracticeLocationDto`) upserts by `hpiI`,
  always sets `source: 'self_registered'`, `selfRegisteredOverride: true`.
- **Search**: `GET /directory/entries` — Postgres `ILIKE`-style filtering
  (`contains`/`mode: 'insensitive'`) on name/subspecialty, exact-match
  subspecialty, boolean flags, and an in-process `state` filter over the
  JSON `practiceLocations` array (documented judgment call in
  `directory.service.ts`: JSON-path filtering is provider-dependent and not
  reliably unit-testable against this build's hand-rolled fake Prisma, and
  it's fine at this build's directory scale per
  `solution-architecture-tech-stack.md`'s "Postgres full-text search
  (initially)" note — revisit if the directory grows large).

### Secure Messaging Gateway (`src/secure-messaging/`)

- **Vendor abstraction** (`vendors/vendor-client.interface.ts`): one
  `SecureMessagingVendorClient` interface (`send()` throws
  `SecureMessagingVendorError` on failure — never a silent
  `{ ok: false }`) implemented by three **MOCK, clearly labelled** clients:
  `MockHealthLinkClient`, `MockMedicalObjectsClient` (the two vendors
  `modules-and-requirements.md` names), and `MockDirectDeliveryClient`
  (stands in for delivering straight into an onboarded specialist's
  platform inbox — the "or directly if the specialist is onboarded" half
  of the routing decision, since `services/specialist-review` is out of
  this build's scope). Each mock fails deterministically when
  `recipientEndpointId` contains `"FAIL"` (test-friendly, no reliance on
  randomness in CI) and optionally at a configurable random rate
  (`*_MOCK_FAILURE_RATE` env vars) for realistic manual testing.
- **Routing decision** (`SecureMessagingService.routeReferral`): resolves
  the target `DirectoryEntry` (by id or `hpiI`), then — if
  `onboardedForDirectDelivery` — routes `direct` via the mock direct-
  delivery client; otherwise routes `secure_messaging` via the entry's
  configured vendor (or `SECURE_MESSAGING_DEFAULT_VENDOR`, default
  `healthlink`), rejecting with `BadRequestException` if no
  `secureMessagingEndpointId` is configured for a non-onboarded specialist.
  The referral clinical content itself is never carried in the routing
  envelope — only a `summary` string (e.g. subspecialty) — so this
  service's own logs/DB stay free of clinical content it has no business
  holding.
- **Never a silent failure**: every routing attempt is a persisted
  `RoutingAttempt` row (`pending` → `delivered`/`failed`, with
  `attemptNumber`, `failureReason`, `vendorMessageId`). On vendor failure:
  1. the `RoutingAttempt` is updated to `failed` **and** a `referral.routed`
     audit outbox row (`payload.status = 'failed'`) is written, in the same
     DB transaction (see "Audit log integration" below);
  2. a best-effort call to the Notification Service's (not-yet-built)
     dual-notification exception endpoint is attempted — failure there is
     logged, never thrown, so a Notification Service outage can't mask the
     real delivery failure;
  3. `SecureMessagingDeliveryException` (HTTP 502) is thrown — a real,
     typed exception a caller cannot accidentally ignore, per
     `modules-and-requirements.md`'s "must not silently fail a routed
     referral — a delivery failure must generate a dual-notification
     exception."
- **Retry**: `POST /secure-messaging/attempts/:id/retry` re-resolves the
  `DirectoryEntry` (so a since-fixed endpoint/vendor is picked up) and
  re-attempts delivery, incrementing `attemptNumber` on the same row.

## Audit log integration

Every write to a clinical/consent-relevant record uses the outbox pattern
(root `CONVENTIONS.md` §7): `AuditOutbox` rows are written in the same DB
transaction as the domain write, and `AuditOutboxRelayService`
(`@nestjs/schedule` `@Interval(5000)`, mirrors
`services/gp-authorisation`'s relay exactly) publishes them to the real
Audit Log Service via `packages/audit-client`, retrying indefinitely on
failure rather than dropping the event.

**Only Secure Messaging Gateway routing resolutions go through this
pattern** — `SecureMessagingService.attemptDelivery` writes a
`referral.routed` row (an `AuditEventType` shared-types already has,
covering both `status: 'delivered'` and `status: 'failed'`) for every
routing decision. **Plain Directory Service writes (NHSD sync,
self-registration) deliberately do NOT** — this is a documented judgment
call, not an oversight:

- Root `CONVENTIONS.md` §7 and `modules-and-requirements.md` both scope the
  structural audit-write requirement to "clinical or consent-relevant"
  records. A specialist's own public practice-directory listing (display
  name, subspecialty, practice locations, consulting days) is provider
  reference data — the same category as a phone-book entry — not a patient
  clinical record or a consent decision.
  `shared-types/src/audit-event.ts`'s `AuditEventType` union has no
  "directory entry created/updated" variant, which is itself a signal this
  wasn't intended to be audited the same way referral/consent/GP-link
  events are.
- `DirectoryService` still logs every self-registration and sync run via
  NestJS's structured `Logger` (satisfying the "structured logging, no
  unstructured console.log" NFR), just not through the tamper-evident
  audit trail.
- **To revisit**: if reviewers decide directory-profile changes should be
  audited the same way, the fix is additive and small — add a
  `'directory.entry.updated'` (and/or `'directory.entry.synced'`) variant
  to `packages/shared-types/src/audit-event.ts`, then route
  `registerSelfProfile`/`NhsdSyncService` through the same
  transaction-plus-outbox pattern `SecureMessagingService` already uses.
  Editing `packages/shared-types` is outside this build's scope
  (`services/directory` only), which is the concrete reason this wasn't
  just done here.

## What's mocked

Every mock is labelled `MOCK — replace with real integration` in its file's
doc comment, per the task brief:

| Interface | Mock implementation | Real integration this stands in for |
|---|---|---|
| `NhsdDirectoryClient` | `MockNhsdDirectoryClient` | National Health Services Directory (Healthdirect Australia) FHIR API — needs a production-access agreement this build doesn't have |
| `HealthPathwaysClient` | `MockHealthPathwaysClient` | HealthPathways Pathway Link API — needs a per-PHN licence/API key |
| `SecureMessagingVendorClient` | `MockHealthLinkClient` | HealthLink secure clinical messaging — needs a vendor agreement |
| `SecureMessagingVendorClient` | `MockMedicalObjectsClient` | Medical-Objects secure clinical messaging — needs a vendor agreement |
| `SecureMessagingVendorClient` | `MockDirectDeliveryClient` | An internal call to `services/specialist-review`'s inbox — that service is out of this build's scope |
| (best-effort HTTP call) | `notifyDeliveryFailure` in `secure-messaging.service.ts` | `services/notification`'s dual-notification exception endpoint — that service is out of this build's scope; this call degrades to a logged no-op if `NOTIFICATION_SERVICE_URL` is unset or unreachable |

Every mock's provider binding lives in exactly one place
(`directory.module.ts` / `secure-messaging.module.ts`) — swapping in a real
client later is a one-line change per interface, not a refactor of calling
code.

## What's incomplete / known gaps

- **`prisma generate`/`prisma migrate dev` could not run in this
  sandbox** — `binaries.prisma.sh` is blocked by outbound egress policy
  (confirmed via `curl "$HTTPS_PROXY/__agentproxy/status"`: 403 on
  CONNECT — identical to the already-documented gap in
  `BUILD_LOG/audit-log.md`, `BUILD_LOG/identity-access.md` and
  `BUILD_LOG/gp-authorisation.md`). Mitigations, mirroring those services:
  - `prisma/migrations/20260813140000_init/migration.sql` is hand-authored
    to match `schema.prisma`'s `DirectoryEntry`/`DirectorySyncRun`/
    `RoutingAttempt`/`AuditOutbox` models — not applied against a real
    Postgres in this sandbox. Run
    `npm run prisma:migrate -w services/directory -- --name init` once
    network access to `binaries.prisma.sh` exists.
  - `jest.config.js` maps `@prisma/client` to
    `test/stubs/prisma-client.stub.ts` for unit tests only.
  - **Unlike `gp-authorisation`, this service's `npm run typecheck` and
    `npm run test:e2e` both pass cleanly** — a root-level `node_modules/
    .prisma/client` stub (not part of this repo/this task's scope; found
    already present at build time, presumably added by another
    concurrently-building agent to unblock cross-service typecheck) now
    provides a generic-enough `PrismaClient` shape. This service's own
    code never depends on that stub having the *specific* models
    (`directoryEntry`, `directorySyncRun`, `routingAttempt`) declared on
    it — every service-layer class narrows `PrismaService` to a
    minimal local interface via `as unknown as XPrisma` (the same pattern
    `gp-authorisation`'s `TxClient` used for its transaction callback,
    applied here to the whole Prisma surface each class touches) before
    calling any model method, so it type-checks regardless of what the
    shared stub declares. `AuditOutboxRelayService` is the one exception
    (calls `this.prisma.auditOutbox` directly), which works because the
    stub happens to already declare `auditOutbox`. **This is inherently
    fragile** — if that root-level stub is later removed or changed to not
    include `auditOutbox`, `AuditOutboxRelayService`'s typecheck (only)
    would start failing the same way `gp-authorisation`'s did; that
    class's actual behaviour and its tests don't depend on the stub at
    all. Verified: `npm run build -w services/directory` and
    `npm run test:e2e -w services/directory` (with `.env` copied from
    `.env.example`) both currently succeed.
- **`RegisterProfileDto`'s controller endpoint doesn't verify the caller's
  token `hpiI` matches the profile being registered** — `BearerAuthGuard`
  only checks the token is valid, not that `principalType === 'specialist'`
  and the token's own `hpiI` claim matches `dto.hpiI` (or that the caller
  is `internal_staff`). Not enforced because `AuthenticatedPrincipal`
  (`packages/auth-client`) doesn't carry an `hpiI` claim yet — same class
  of gap as `identity-access`'s and `gp-authorisation`'s BUILD_LOGs already
  note for other services. Documented in `directory.controller.ts`'s doc
  comment as a follow-up, not silently skipped.
- **No live integration test against a running Keycloak/Postgres/Audit Log
  Service** — same "no Docker daemon in this sandbox" constraint every
  other service's BUILD_LOG documents.
- **The Referral Service doesn't yet call `POST /secure-messaging/route`**
  (or `GET /directory/pathway-suggestion`) — those integration points are
  real and tested from this service's side; whoever builds
  `services/referral`'s send-referral flow needs to actually call them.
- **HealthPathways/NHSD sample data is illustrative, not exhaustive** — 12
  specialists, 11 pathway categories. Real NHSD/HealthPathways datasets are
  orders of magnitude larger; this is enough to exercise every code path
  (idempotent upsert, self-registration override, keyword match, static
  fallback, PHN unavailability) honestly, not a claim of full coverage.
- **Docker build**: `Dockerfile` updated with
  `RUN npm run prisma:generate -w services/directory` before the build
  step (the class of fix `BUILD_LOG/gp-authorisation.md` already made) —
  not verified end-to-end (no Docker daemon in this sandbox, same as every
  other service so far).

## Verified

- `npm run test -w services/directory` — **47/47 unit tests pass**:
  - `DirectoryService` (search filters, self-registration idempotency,
    HealthPathways success + graceful-degradation-to-static-link +
    general-category fallback) — 10 tests
  - `NhsdSyncService` (create/idempotent re-sync/update-on-resync/
    self-registered-entries-never-overwritten/sync-run-failure-bookkeeping/
    sync-run-success-bookkeeping) — 6 tests
  - `MockNhsdDirectoryClient` (realistic sample shape, unique hpiI,
    repeatable) — 3 tests
  - `MockHealthPathwaysClient` (keyword match, case-insensitive partial
    match, general fallback, PHN-unavailable throw, PHN-available
    no-throw) — 5 tests
  - `MockHealthLinkClient` / `MockMedicalObjectsClient` /
    `MockDirectDeliveryClient` (success, deterministic FAIL-substring
    failure, configured-failure-rate) — 7 tests
  - `SecureMessagingService` (route via healthlink/medical_objects/direct,
    audit outbox write on success, 404 on unresolvable entry, 400 on
    missing endpoint config, **delivery-failure path: RoutingAttempt
    marked failed + audit outbox `status:'failed'` written + real
    exception thrown, not swallowed**, best-effort notification-failure
    doesn't mask the real exception, retry succeeds after the underlying
    issue is fixed, retry rejects a non-failed attempt, list/get attempts)
    — 13 tests
  - `AuditOutboxRelayService` (publish success, failure leaves row
    unpublished without throwing, skips already-published rows) — 3 tests
  - Health smoke test (unit + e2e-shaped) — 2 unit tests, 1 e2e test
- `npx eslint services/directory/src services/directory/test
  --max-warnings=0` — clean, zero warnings.
- `npx tsc -p services/directory/tsconfig.json --noEmit` — clean, zero
  errors.
- `npm run build -w services/directory` — succeeds.
- `npx prettier --check` — clean after `--write` (files reformatted to
  match `.prettierrc.json`; no logic changes).
- `npm run test:e2e -w services/directory` (with `.env` copied from
  `.env.example`) — **1/1 passes**.

## How to run/test this service in isolation

```bash
npm install                                                   # from repo root
cp services/directory/.env.example services/directory/.env
docker compose up -d postgres redis keycloak                  # needs a Docker daemon

npm run prisma:generate -w services/directory                 # needs network access to binaries.prisma.sh
npm run prisma:migrate -w services/directory -- --name init   # or apply prisma/migrations/20260813140000_init/migration.sql directly
npm run start:dev -w services/directory
# -> http://localhost:3006/health
# -> http://localhost:3006/directory/entries
# -> http://localhost:3006/directory/pathway-suggestion?referralReason=chest%20pain

npm run test -w services/directory        # unit tests — no external infra needed
npm run test:e2e -w services/directory    # needs .env present; passes against the shared Prisma stub even without a live Postgres in this sandbox — see "What's incomplete" above
```

See `services/directory/README.md` for the full endpoint table.
