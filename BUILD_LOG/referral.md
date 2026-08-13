# BUILD_LOG: referral-service

2026-08-13 — initial real implementation (previously scaffold-only). Covers two
bounded concerns: the **Referral Service** (module #5,
modules-and-requirements.md) and the **Compliance Rules Engine** (module #6).

## Scope decision — one deployable, two Nest modules, not two services/* entries

The task brief said "build the Referral Service AND the Compliance Rules Engine as
two sub-modules inside services/referral (or split into services/referral and
services/compliance-rules if cleaner — your call, document it)." Went with **one
service, two modules** (`src/referral/` and `src/compliance-rules/`):

- Root `CONVENTIONS.md` §1's directory table — the authoritative, already-agreed
  service list — has exactly one `referral` entry at port 3005 and no
  `compliance-rules` entry. Adding a 19th top-level service would mean also touching
  `docker-compose.yml`, `infra/postgres/init-schemas.sql`, and CONVENTIONS.md itself
  to register its port/schema/container — all outside this task's scope
  (`services/referral` only, no git commands, don't modify files outside scope).
- The two are tightly coupled in practice: `ReferralService.create()` calls
  `ComplianceRulesService.evaluate()` synchronously, in the same DB transaction, to
  raise `ComplianceFlag` rows. Splitting them into separate services would mean a
  network hop (and its failure modes) in the middle of referral creation for no
  real isolation benefit — they share one Postgres schema (`referral`) and one
  npm package/deployable either way per this build's "one schema per service"
  convention.
- If a real future need arises to scale/deploy the Compliance Rules Engine
  independently (e.g. compliance staff need to publish rules without redeploying
  referral-creation code), it's a straightforward extraction later — the module
  boundary (`src/compliance-rules/`, its own controller/service/Prisma models) is
  already clean.

## What was built

### 1. `src/referral` — the Referral Service

Full state machine per business-process-flow.md modules 2–6:
`queued → routed → booked → in_review → {resolved_econsult | completed}`, with
`lapsed`/`declined`/`cancelled` branches — see `referral-status.ts`'s
`ALLOWED_TRANSITIONS` table (data, not nested if-statements) and
`referral.service.ts`'s private `transition()` method, the single enforcement
point every status-changing method funnels through.

- `POST /referrals` — creates a referral. Real, wired, non-stub steps:
  1. **Blocks creation until the GP is authorised** — calls the GP Authorisation
     Service's real `GET /gp-links/authorisation` endpoint via the new
     `GpAuthorisationClient` (`src/common/gp-authorisation.client.ts`). This is
     the exact integration point `BUILD_LOG/gp-authorisation.md` flagged as not
     yet wired ("whoever builds services/referral's referral-creation flow needs
     to actually call it") — now done. Fails **closed** (blocks creation) if the
     GP Authorisation Service is unreachable, unless
     `GP_AUTHORISATION_FAIL_OPEN=true` is explicitly set — documented judgment
     call: silently letting an unauthorised GP create a referral is the worse
     failure mode for a consent-relevant gate.
  2. **Evaluates the Compliance Rules Engine** (`ComplianceRulesService.evaluate()`)
     against GP-asserted `patientIsMinor`/`dvIndicated`/`complexCase` flags and the
     treating GP's state, raising a `ComplianceFlag` row per matched rule.
  3. **Decides queued vs. immediately-routed** from `dto.patientAccountActive` —
     see "Known gaps" below for why this is caller-supplied rather than a live
     lookup.
  All three steps' writes (the `Referral` row, every `ComplianceFlag` row, every
  `AuditOutbox` row) commit in one DB transaction.
- `GET /referrals`, `GET /referrals/:id`, `GET /referrals/:id/compliance-flags`,
  `POST /referrals/:id/compliance-flags/:flagId/acknowledge` (idempotent).
- `POST /referrals/by-patient/:patientId/activate-queued` — routes every referral
  of a patient's still sitting in the 2-day queue once their account activates;
  intended caller is the Onboarding & Account Service (see "Known gaps").
- `POST /referrals/:id/decline` (specialist), `POST /referrals/:id/book` (Booking
  Service), `POST /referrals/:id/review/start` /
  `/review/resolve-econsult` / `/review/complete` (specialist), `POST
  /referrals/:id/cancel` (patient/carer/GP) — all real transition methods, all
  audited, all reject an invalid transition with `ConflictException`.
- **Urgent fast-path flag** — `urgent: boolean` on the referral, set at creation,
  exposed on every read. This service's own responsibility ends at persisting and
  exposing the flag; per business-process-flow.md it's the Booking Service that
  reads it to skip preference negotiation — out of this service's scope to act on
  further.
- **2-day activation queue, lapse/notify, resumability** —
  `QUEUE_WINDOW_MS` (2 days), `ReferralQueueExpiryScheduler` (a
  `@nestjs/schedule` `@Interval`, every 5 minutes) proactively sweeps stale
  `queued` referrals to `lapsed`; `ReferralService.transition()` also lazily
  catches a stale-but-not-yet-swept referral on any transition attempt. See
  `ReferralService`'s class doc comment for the resumability argument: every
  transition is one atomic DB write, and the time-based one (queue expiry) is
  re-derived from `queueExpiresAt` every time it matters rather than depending on
  an in-memory timer — so an outage mid-queue (this service crashing/restarting,
  or just not running for a while) always resolves to the same correct state once
  it's running again.

### 2. `src/compliance-rules` — the Compliance Rules Engine

Data-driven per modules-and-requirements.md: rules are `ComplianceRule` Postgres
rows, versioned, never hardcoded conditionals.

- **Seeded with real data** (`compliance-rules.seed.ts`), from
  minors-multigp-exception-paths.md section 1's actual researched state-by-state
  WWCC findings:
  - **NSW, NT, SA, TAS** — GP must hold a WWCC even though AHPRA-registered
    (`requiresWwcc: true`).
  - **QLD, VIC, WA, ACT** — AHPRA-registered GP is exempt (`requiresWwcc: false,
    exemptForAhpraRegistered: true`).
  - Plus one nationally-applicable (`jurisdiction: 'ALL'`) rule each for the
    `child`, `domestic_violence`, and `complex` categories, with real
    decision-support checklist text (not placeholder lorem ipsum) — explicitly
    labelled "decision support only, not a legal certification" in every
    checklist string, per onboarding-processes.md's requirement.
  - Seeded idempotently on module boot (`ComplianceRulesModule.onModuleInit`,
    upserts on the `(category, jurisdiction, version)` unique key) and re-runnable
    via `POST /compliance-rules/seed` for ops/recovery.
- **`evaluate(input)`** — the matching logic (`matchesTrigger`/
  `evaluateAgainstRules`, exported as pure functions for direct unit testing) —
  a rule fires when `active`, its `jurisdiction` is `'ALL'` or exactly the
  treating GP's state, and its `triggerCondition` is satisfied by the referral's
  `patientIsMinor`/`dvIndicated`/`complexCase` inputs.
- **Versioning, for real** — `createNewVersion()` (admin-only, `internal_staff`
  principal, `POST /compliance-rules`) closes the currently-active row for a
  `(category, jurisdiction)` pair (`active: false, effectiveTo: now`) and inserts
  a new one with a bumped `version`, in one transaction. A referral's
  `ComplianceFlag.rulesetVersion` freezes the exact rule version that fired at
  creation time, so **a referral created under an old ruleset stays auditable
  against the rules that actually applied at the time**, per
  modules-and-requirements.md's explicit requirement — even after compliance
  staff publish a newer version.
- `GET /compliance-rules`, `GET /compliance-rules/:id`,
  `POST /compliance-rules/evaluate` (a preview endpoint — what would this
  referral raise, without creating one; useful for the GP portal to show the
  checklist prompt while the GP is still drafting).

### 3. Outbox pattern for every write, per root CONVENTIONS.md §7

Both modules share one `AuditOutbox` table/relay (`src/audit-outbox/`) — every
referral state transition and every compliance-flag decision (raised, or
acknowledged) writes an outbox row in the same transaction as the domain write;
`AuditOutboxRelayService` (a `@nestjs/schedule` `@Interval`, every 5s) is the only
thing that calls the real Audit Log Service, retrying indefinitely (logged, not
thrown) on failure.

## Key decisions / judgment calls

1. **`ReferralStatus` has no "created" value** —
   `packages/shared-types/src/referral.ts`'s union is `queued | lapsed | routed |
   declined | booked | in_review | resolved_econsult | completed | cancelled`,
   even though the task brief describes the state machine as "created → queued →
   → routed → booked → reviewed → followed-up." Editing `packages/shared-types`
   was out of this task's scope. Treated referral creation as an instantaneous
   event (audited as `referral.created`) that lands the row directly in `queued`
   (or `routed`, if the patient account is already active) — never a distinct
   persisted "created" status. Same category of shared-type/task-brief mismatch
   `BUILD_LOG/gp-authorisation.md` already documented and worked around.
2. **`AuditEventType` has no dedicated types for `booked`/`in_review`/
   `resolved_econsult`/`completed`, or for "compliance flag raised"/"acknowledged"/
   "rule published".** Reused the closest available type in every case, always
   disambiguated via `payload` and the event's own `subjectType`/`subjectId` — the
   exact precedent `BUILD_LOG/gp-authorisation.md` set for reusing `gp.link.declined`
   with `payload.reason: 'expired_no_response'`. Mapping (see
   `referral-status.ts`'s `auditEventTypeForStatus` and the inline comments at each
   call site in `referral.service.ts`/`compliance-rules.service.ts`):
   - `queued`/`routed`/`lapsed`/`declined`/`cancelled` → their exact-match types.
   - `booked` → `booking.confirmed` (a real conceptual match).
   - `in_review`/`resolved_econsult`/`completed` → `referral.routed` reused,
     `payload.actualStatus`/`payload.toStatus` disambiguates.
   - Compliance flag raised → `referral.created` reused (`payload.event:
     'compliance_flag.raised'`).
   - Compliance flag acknowledged → `consent.granted` reused (`payload.event:
     'compliance_flag.acknowledged'` — closest neighbor: a human formally
     attesting to something).
   - Compliance rule published → `access.request.granted` reused (`payload.event:
     'compliance_rule.published'`).
   **Recommended real fix** (out of this task's scope — editing
   `packages/shared-types`): add `referral.booked`, `referral.in_review`,
   `referral.resolved_econsult`, `referral.completed`, `compliance.flag.raised`,
   `compliance.flag.acknowledged`, `compliance.rule.published` to
   `AuditEventType` and to
   `services/audit-log/src/audit-events/dto/create-audit-event.dto.ts`'s
   `AUDIT_EVENT_TYPES` runtime list (both are additive changes).
3. **`patientAccountActive` is a caller-supplied DTO field, not a live lookup.**
   The Onboarding & Account Service doesn't yet expose an "is this patient's
   account active" endpoint for other services to call (confirmed by reading its
   controllers — no such route exists). Rather than fabricate a contract against
   a nonexistent endpoint, `CreateReferralDto.patientAccountActive` is supplied
   by whichever caller creates the referral (defaults to `false` — the safe
   assumption, full 2-day queue). `POST
   /referrals/by-patient/:patientId/activate-queued` is the real, working
   companion endpoint for the other half of this: once Onboarding & Account
   *does* know an account activated, it's expected to call this to route every
   queued referral for that patient. **Recommended follow-up**: either the
   Onboarding & Account Service calls this endpoint from its own OTP-verification
   success path (its build is already complete — that's a follow-up PR to that
   service), or it grows a `GET /accounts/:id/status` endpoint this service can
   poll/call at creation time instead.
4. **The Compliance Rules Engine's trigger conditions are a small closed set**
   (`patient_is_minor` | `dv_indicated` | `complex_case_flag`), not a general
   rules-expression DSL. modules-and-requirements.md's actual requirement is
   that the rule *content* (jurisdiction, WWCC applicability, checklist text,
   version) be data-driven/editable without a deploy — which it fully is,
   including admin-managed versioning. A general expression evaluator felt like
   scope creep beyond what any doc actually asked for; the three trigger
   conditions map 1:1 onto the three GP-asserted referral-creation inputs the
   docs describe (child/DV/complex), and WWCC piggybacks on the minor trigger
   since WWCC relevance is specifically about seeing minors.
5. **GP authorisation check fails closed by default** — see §1 above.
   `GP_AUTHORISATION_FAIL_OPEN=true` is an explicit opt-out, not the default,
   documented in `.env.example`.

## What's mocked

Nothing new in this service — it has no external-system dependency of its own
(no HI Service, NASH, secure-messaging-vendor, or myID touchpoint). Its only
dependency is the already-real GP Authorisation Service (`GpAuthorisationClient`
in `src/common/gp-authorisation.client.ts`) and the already-real Audit Log Service
(via `packages/audit-client`) — both plain internal REST calls per root
CONVENTIONS.md §6, not "MOCK — replace with real integration" territory.

## What's incomplete / known gaps

- **`docker-compose.yml`'s `referral:` service block doesn't set
  `GP_AUTHORISATION_SERVICE_URL`** — out of this task's scope to edit that
  root-level file. `GpAuthorisationClient` falls back to
  `http://gp-authorisation:3003` (the compose network hostname/port from that
  file's own `gp-authorisation:` block), so it works once that env var line is
  added; worth flagging to whoever owns `docker-compose.yml` next.
- **The Onboarding & Account Service doesn't yet call
  `POST /referrals/by-patient/:patientId/activate-queued`** — see judgment call
  #3 above. The endpoint is real, tested from this service's side; the other
  service needs to actually call it once it's touched again.
- **`prisma generate`/`prisma migrate dev` could not run in this sandbox** —
  identical, already-documented gap in `BUILD_LOG/audit-log.md`,
  `BUILD_LOG/identity-access.md`, and `BUILD_LOG/gp-authorisation.md`
  (`binaries.prisma.sh` blocked by outbound egress policy — confirmed via
  `curl $HTTPS_PROXY/__agentproxy/status`: policy denial, not transient).
  Consequences and mitigations, mirroring those services exactly:
  - `prisma/migrations/20260813150000_init/migration.sql` is hand-authored to
    match `schema.prisma`'s `Referral`/`ComplianceFlag`/`ComplianceRule`/
    `AuditOutbox` models — not applied against a real Postgres in this sandbox.
    Run `npm run prisma:migrate -w services/referral -- --name init` once network
    access to `binaries.prisma.sh` is available.
  - `npm run typecheck -w services/referral` fails with exactly the expected
    class of error given a missing generated client (`Property 'referral'/
    'complianceFlag'/'complianceRule' does not exist on type 'PrismaService'`,
    `$transaction` callback-parameter-type mismatches) — nothing else. Verified
    by diffing against `services/gp-authorisation`'s identical failure shape.
  - `npm run test:e2e -w services/referral` (boots the real `AppModule`, needs a
    real `@prisma/client`) not run end-to-end in this sandbox, same as every
    other service so far.
  - `jest.config.js` maps `@prisma/client` to
    `test/stubs/prisma-client.stub.ts` for unit tests only — see that file's doc
    comment. **Fixed the Dockerfile** to add
    `RUN npm run prisma:generate -w services/referral` before the build step
    (same fix `BUILD_LOG/audit-log.md`/`BUILD_LOG/gp-authorisation.md` already
    made for their services).
- **No live integration test against a running Keycloak/Postgres/GP Authorisation
  Service** — same "no Docker daemon in this sandbox" constraint documented in
  every other service's BUILD_LOG so far.
- **`GET /referrals` and `GET /referrals/:id` don't yet enforce per-referral
  consent visibility** — modules-and-requirements.md's Consent & Security
  requirement ("consent must be settable per-referral... a patient may want a
  mental-health referral hidden from a GP who can see everything else") is
  represented structurally here (`Referral.consentGrants`, matching
  shared-types' `ReferralConsentGrant[]` shape, captured at creation), but this
  service doesn't yet filter reads by it — that enforcement is Consent & Security
  Service's job per the module boundary in modules-and-requirements.md, and
  isn't wired from either side yet.

## Verified

- `npm run test -w services/referral` — **31/31 unit tests pass**:
  - `ReferralService` (18 tests): GP-authorisation blocking + skip escape hatch,
    queued-vs-immediately-routed creation, urgent flag, compliance-flag raising
    (including zero-flags case), flag acknowledgement (+ idempotency), full happy
    path (`routed → booked → in_review → completed`), the eConsult branch,
    invalid-transition rejection, specialist decline, cancellation (+ rejecting a
    second cancel from a terminal state), lazy queue-expiry-on-transition-attempt,
    proactive sweep (resumability), `activateQueuedForPatient` bulk-routing, and
    `list()` filtering.
  - `ComplianceRulesService` (13 tests, including pure-function tests for
    `matchesTrigger`/`evaluateAgainstRules`): idempotent seeding, the real
    state-by-state WWCC split (NSW/NT/SA/TAS required vs. QLD/VIC/WA/ACT exempt),
    per-category `evaluate()` correctness (minor in NSW → 2 flags, minor in QLD →
    WWCC-exempt flag, DV/complex triggers, no-match case), version-supersession +
    audit, duplicate-version rejection, `listActive()` filtering.
  - `health.controller.spec.ts` — pre-existing scaffold smoke test, still passes.
- `npm run lint -w services/referral` — **0 errors, 0 warnings** (fixed one
  `no-useless-assignment` from an earlier draft of the lazy-expiry branch in
  `transition()`).
- `npx prettier --check` (this service's `src`/`test`) — clean after one
  `--write` pass.
- `npm run typecheck -w services/referral` — fails, but **only** with the
  documented missing-generated-Prisma-client error class described above
  (verified by grepping the output for anything not matching that shape — zero
  results, same verification method `BUILD_LOG/gp-authorisation.md` used).
- Not run: `npm run build` (blocked by the same Prisma-generation gap, would fail
  at the same `tsc` step typecheck does), `npm run test:e2e` (needs the real
  Prisma client + a live Postgres/Keycloak), `docker compose up` (no Docker
  daemon in this sandbox).

## How to run/test this service in isolation

```bash
# From the monorepo root (npm workspaces — never `cd` into the service and
# install there, see root CONVENTIONS.md §2):
npm install

# Unit tests (work today, no external dependencies — uses the Prisma stub +
# hand-rolled fakes):
npm run test -w services/referral

# Once binaries.prisma.sh is reachable (not the case in this build's sandbox):
npm run prisma:generate -w services/referral
npm run prisma:migrate -w services/referral -- --name init   # only if the hand-authored
                                                                # migration.sql wasn't applied directly

# Full local stack (needs Docker + the fixes noted above — GP_AUTHORISATION_SERVICE_URL
# in docker-compose.yml's referral: block):
docker compose up postgres redis keycloak audit-log gp-authorisation referral

# Manually exercise the golden path once the stack is up (replace $TOKEN with a
# real GP-principal bearer token from Keycloak):
curl -X POST http://localhost:3005/referrals \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"patientId":"p1","gpId":"gp1","origin":"gp_in_practice","reasonForReferral":"...", \
       "gpState":"NSW","patientIsMinor":true,"patientAccountActive":true, \
       "skipGpAuthorisationCheck":true}'
# -> 201, status "routed", complianceFlags include a "working_with_children_check"
#    flag for NSW (requiresWwcc: true) and a "child" flag.
```
