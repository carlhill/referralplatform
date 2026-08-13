# BUILD_LOG: consent-security-service

2026-08-13 — initial real implementation (previously scaffold-only).

## What was built

Five bounded-concern modules, each with its own Prisma model(s), service,
controller, and unit tests — see `services/consent-security/README.md` for
the full endpoint table.

### 1. `src/consent-records` — the consent page's write/read API

- Generic grant/revoke for `gp_link`, `carer_delegate`,
  `sensitive_category_access` consent (`ConsentRecord` — mirrors
  `packages/shared-types/src/consent-record.ts`).
- **Per-referral visibility** (`ReferralVisibilityController`,
  `/consent/referral-visibility`) — the requirement that consent be
  "settable per-referral, not just account-wide"
  (`claude/modules-and-requirements.md`). `ConsentRecord` has a single
  `subjectId` string; per-referral visibility is modelled as a **composite
  subjectId** (`"<referralId>:<granteeId>"`, see
  `consent-subject-type.ts`'s `referralVisibilitySubjectId`/
  `parseReferralVisibilitySubjectId`) rather than adding a column that
  would only apply to one of four `subjectType`s. `granteeId` can be a
  specific GP/specialist id or the literal `'all_linked_gps'`; the check
  endpoint (`GET /consent/referral-visibility/check`) honours either.
- Every grant/revoke goes through the outbox pattern
  (`consent.granted`/`consent.revoked`).

### 2. `src/linked-gps` — the "linked GPs and practices" list + revoke

A thin, **real HTTP proxy** over the GP Authorisation Service's REST API
(`GET/POST http://gp-authorisation:3003/gp-links...`), forwarding the
caller's own bearer token so that service's own auth/step-up checks apply
unchanged. `GPLink` records are owned by `services/gp-authorisation`, not
this service — per root `CONVENTIONS.md` §6, a service never reads another
service's schema directly, and per §6's general default, this is a plain
`fetch` call rather than a new `packages/*-client` (only two services talk
to each other this way so far, well under the "three or more" threshold
that doc sets for justifying a shared client library).

### 3. `src/reattestations` — periodic carer/delegate re-attestation

`ReattestationSchedule` tracks *when* a re-attestation is next due for a
given carer/patient pair — the actual `Carer` record lives in the
Onboarding & Account Service (out of this service's schema per
CONVENTIONS §6), so this is deliberately narrower than "own the carer
relationship." `POST /reattestations` upserts a schedule (cadence defaults
to 365 days, per `identity-security-recommendations.md` section 3 step 7);
`POST /reattestations/:id/attest` resets the clock and audits
`carer.reattested`; `GET /reattestations/due` is a polling feed for the
Notification Service (see "Interim polling pattern" below).

### 4. `src/concerns` — the "raise a concern" triage engine

- `src/concerns/triage.ts` — the actual decision logic behind
  `complaints-continuity-deceased.md` section 1: "the UI asks
  plain-language questions, not 'select a category.'" `RaiseConcernDto` has
  three boolean plain-language questions
  (`isAboutHowCareWasHandled` / `isAboutSomethingNotWorkingOnThePlatform` /
  `isAboutSomeoneSeeingSomethingTheyShouldnt`), never a `category` field.
  `triageConcern()` is a deterministic decision table: privacy > clinical >
  platform priority when more than one is flagged (documented judgment
  call — a privacy breach is treated as most urgent regardless of what else
  is flagged, since it may involve an active unauthorised-access
  situation), throws `BadRequestException` if none are.
- **GP-copy consent check is real, not just documented**: for a clinical
  concern with a `gpNotifiedId`, `ConcernsService` calls
  `ConsentRecordsService.listForPatient(patientId, 'gp_link')` (same
  service, injected directly — no network hop) and only keeps
  `gpNotifiedId` if there's an active, non-revoked `gp_link` consent record
  for that GP; otherwise it's silently dropped. This is the concrete
  mechanism behind "the GP is copied ... with the patient's existing
  consent settings respected."
- Every concern is logged via the outbox pattern regardless of category
  (`concern.raised`, then `concern.resolved` on resolution) —
  "this is what makes 'raise a concern' trustworthy rather than a black
  hole."
- `POST /concerns/:id/escalate-to-oaic` — privacy/consent-breach concerns
  only; see "Key decisions" #2 for the audit-type reuse this needed.

### 5. `src/deceased` — the flag/freeze workflow + human-reviewed access queue

- `DeceasedFlagsService.flag()` — the GP-triggered first-notice point
  (`complaints-continuity-deceased.md` section 3). One active flag per
  patient (`DeceasedFlag.patientId` is `@unique`); re-flagging an
  already-actively-flagged patient is a `ConflictException`, but flagging a
  patient with a *previously deactivated* flag correctly re-activates it
  (upsert-shaped, not insert-only).
- **Cross-service freeze signal**: in the same transaction as the flag
  write, publishes a `patient.deceased.frozen` event via
  `EventsService.publishInTx` — see "Interim polling pattern" below for why
  this is a Postgres table + `GET /events` endpoint rather than a real
  queue, and exactly which two other services are expected to consume it
  (Follow-up & Recall, Referral Service) and what they're expected to do
  (suppress every pending reminder including already-scheduled ones;
  administratively close any referral in the 2-day activation queue).
  Carer/delegate access revocation on freeze is signalled the same way
  (`payload.carerDelegateAccessRevoked: true`) since `Carer` records
  belong to the Onboarding & Account Service.
- `src/deceased/state-eligibility.ts` — the state-keyed
  executor/administrator/immediate-family/coroner default-eligibility rule
  from `complaints-continuity-deceased.md` section 3 ("in Victoria and the
  ACT, only the executor or administrator ... in NSW and other states,
  immediate family can also request it ... the coroner has statutory
  access"). **Decision support only, never auto-approval** — surfaced as a
  computed `eligibleByDefaultStateRule` field on API responses
  (`withEligibilityHint()` in the controller), never stored, never
  bypasses the human review step.
- `AccessRequestsService` — the actual queue.
  `POST /deceased-flags/:patientId/access-requests` requires an active
  deceased flag to exist first (`getActiveFlag` throws `NotFoundException`
  otherwise, which is what stops this being usable as a generic
  "request my data" endpoint for a living patient). `approve`/`deny` are
  staff-only, audited (`access.request.granted`/`access.request.denied`),
  and refuse to re-decide an already-decided request. `approve` is
  **step-up gated** — root `CONVENTIONS.md` §8 names "granting
  deceased-patient access" as the other worked example of a step-up action
  (alongside "approving a new GP link," which `services/gp-authorisation`
  gates).

### Interim polling pattern for cross-service events (`src/events`)

Root `CONVENTIONS.md` §6 names SQS/SNS as the intended real async
transport but is explicit it's "not yet wired into this scaffold."
`PublishedEvent` (a Postgres table in this service's own schema) +
`GET /events?type=&since=` is the documented stand-in: other services are
expected to poll this endpoint rather than this service calling their APIs
directly, so `consent-security` doesn't need to know who's listening.
Swapping this for a real queue later is additive — `EventsService.publishInTx`
keeps the same call shape, only the storage/transport underneath changes.
**Whoever builds `services/followup-recall` and finishes `services/referral`'s
suppression logic needs to actually wire up polling against this endpoint**
— that integration doesn't exist yet from the consuming side.

## Key decisions / judgment calls

1. **Composite `subjectId` for referral-scoped consent** — see module 1
   above. The alternative (a dedicated `granteeId` column on
   `ConsentRecord`) would only be populated for one of four `subjectType`s
   and complicate the model for the other three; the composite-key
   convention is documented in one place
   (`consent-subject-type.ts`) and hidden behind a dedicated
   `/consent/referral-visibility` API so callers never need to know it.
2. **No `AuditEventType` for "access request raised" or "concern
   escalated to OAIC."** `packages/shared-types/src/audit-event.ts`'s union
   has `access.request.granted`/`access.request.denied` (used for real) but
   nothing for the initial submission; and `concern.raised`/`concern.resolved`
   but nothing for an escalation. Two different resolutions, both
   documented at the call site:
   - **Access-request submission**: not audited via the outbox at all — see
     `AccessRequestsService.submit()`'s doc comment. Reusing
     `access.request.granted`/`denied` for an undecided request would
     misrepresent the outcome in the signed audit trail, which felt worse
     than the gap of not auditing the submission event itself (it's still
     durably recorded in Postgres and queryable). Recommended fix: add
     `access.request.raised` to shared-types.
   - **OAIC escalation**: reuses `concern.resolved` with
     `payload.outcome: 'escalated_to_oaic'` — same "closest accurate fit"
     pattern used in `BUILD_LOG/gp-authorisation.md` for expired GP links,
     because `services/audit-log`'s `CreateAuditEventDto` validates `type`
     against a fixed list and a made-up type would fail to relay forever.
     Recommended fix: add `concern.escalated` to shared-types.
   Editing `packages/shared-types` was out of scope for this task in both
   cases.
3. **Access-request submission assumes staff-assisted intake, not genuine
   self-service** — documented directly in
   `AccessRequestsController.submit()`'s doc comment. A real
   executor/family/coroner requester may have no ReferralPlatform account
   at all, so gating this endpoint behind `BearerAuthGuard` implicitly
   assumes a staff member submits on their behalf after an out-of-band
   conversation. Consistent with "never self-service," but the actual
   public-facing intake *channel* (a form + staff triage, most likely)
   still needs real design — flagged as a gap, not silently assumed away.
4. **Step-up (`assertStepUp`) is a third, deliberate copy** of the same
   function now in `services/identity-access` and
   `services/gp-authorisation` — see that file's doc comment. Recommend
   promoting to `packages/auth-client` next time any of the three services
   is touched, rather than letting a fourth copy appear.

## What's mocked / interim (clearly labelled in code)

- `src/events` — polling-based `PublishedEvent` table standing in for a
  real message queue (SQS/SNS), per root CONVENTIONS.md §6's own note that
  this isn't wired into the scaffold yet.
- Access-request intake assumes staff-assisted submission (see judgment
  call #3) rather than a genuine public-facing channel.

## What's incomplete / known gaps

- **`prisma generate`/`prisma migrate dev` could not run in this sandbox**
  — identical `binaries.prisma.sh` egress-policy block already documented
  in `BUILD_LOG/audit-log.md`, `BUILD_LOG/identity-access.md`, and
  `BUILD_LOG/gp-authorisation.md`. Same mitigations applied here:
  hand-authored `prisma/migrations/20260813140000_init/migration.sql`
  (matches `schema.prisma` exactly — seven tables: `consent_record`,
  `reattestation_schedule`, `concern`, `deceased_flag`, `access_request`,
  `published_event`, `audit_outbox`), a test-only `@prisma/client` stub
  wired via `jest.config.js`'s `moduleNameMapper` only, and a
  `RUN npm run prisma:generate -w services/consent-security` step added to
  the Dockerfile before the build step (was missing, same class of fix
  `BUILD_LOG/audit-log.md` made first). `npm run typecheck` fails with
  exactly the Prisma-codegen-dependent errors you'd expect
  (`Property 'consentRecord'/'concern'/'deceasedFlag'/etc. does not exist
  on type 'PrismaService'`) — verified via grep, nothing else. `npm run
  test:e2e` fails to compile for the same reason (boots the real
  `AppModule`); not run end-to-end in this sandbox.
- **No live integration test against a running Keycloak/Postgres/
  gp-authorisation-service** — no Docker daemon in this sandbox, same
  constraint every other service's BUILD_LOG documents.
- **`docker-compose.yml`'s `consent-security:` environment block doesn't
  set `GP_AUTHORISATION_SERVICE_URL` or `STEP_UP_ACR`** — both fall back to
  this service's own defaults (`http://localhost:3003` and `'passkey'`,
  per `.env.example`), which is wrong for `GP_AUTHORISATION_SERVICE_URL`
  specifically inside docker-compose's network (should be
  `http://gp-authorisation:3003`, matching the pattern every other
  inter-service URL in that file uses). Flagged for whoever owns
  `docker-compose.yml` (out of this task's scope to edit directly) — this
  is a real, concrete follow-up, not a hedge.
- **Nothing on the consuming side polls `GET /events` yet** — see "Interim
  polling pattern" above. The Follow-up & Recall Service and Referral
  Service's actual reminder/queue-suppression logic doesn't exist from
  their side; this service only guarantees the signal exists and is
  queryable.
- **`ReattestationSchedule` is not yet created automatically when a carer
  account is created** — `POST /reattestations` is real and tested, but
  nothing in `services/onboarding-account` (out of this task's scope)
  calls it yet. Whoever builds that service's carer-registration flow
  needs to call this endpoint once a carer/delegate relationship is
  established.

## Verified

- `npm run test -w services/consent-security` — **42/42 unit tests pass**
  across 9 suites: `ConsentRecordsService` (grant/revoke/list +
  referral-visibility grant/idempotency/`all_linked_gps`/revoke/list, 11
  tests), `ReattestationsService` (schedule/upsert/attest/listDue, 5
  tests), `ConcernsService` (triage routing, consent-gated GP copy,
  resolve, OAIC escalation, 5 tests), `triageConcern` (5 tests),
  `DeceasedFlagsService` (flag/re-flag-conflict/getActiveFlag/listActive +
  freeze-event payload shape, 4 tests), `AccessRequestsService`
  (submit/NotFound-if-not-deceased/approve/deny/no-redecide, 5 tests),
  `isEligibleByDefaultStateRule` (4 tests), `LinkedGpsService` (real
  `fetch`-mocked HTTP proxy behaviour incl. header forwarding and
  `BadGatewayException` on downstream failure, 3 tests), health smoke test.
- `npx eslint services/consent-security/src services/consent-security/test --max-warnings=0`
  — clean, zero warnings.
- `npx tsc -p services/consent-security/tsconfig.json --noEmit` — clean
  except the Prisma-codegen-dependent errors explained above (verified via
  grep for anything not matching "does not exist on type 'PrismaService'":
  zero results after fixing two real type issues found along the way —
  a `PublishedEventTxClient`/`TxClient` return-type mismatch in
  `deceased-flags.service.ts`, and two implicit-`any` lambda parameters in
  `consent-records.service.ts`'s `listReferralVisibility`).

## How to run/test this service in isolation

```bash
npm install                                                        # from repo root
cp services/consent-security/.env.example services/consent-security/.env
docker compose up -d postgres redis keycloak gp-authorisation      # needs a Docker daemon
npm run prisma:generate -w services/consent-security                # needs network access to binaries.prisma.sh
npm run prisma:migrate -w services/consent-security -- --name init  # or apply migration.sql directly
npm run start:dev -w services/consent-security                      # -> http://localhost:3004/health

npm run test -w services/consent-security        # unit tests — no external infra needed
npm run test:e2e -w services/consent-security     # needs the docker-compose infra + a generated Prisma client
```

See `services/consent-security/README.md` for the full API table.
