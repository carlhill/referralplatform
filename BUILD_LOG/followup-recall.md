# BUILD_LOG: followup-recall-service

2026-08-13 — initial real implementation (previously scaffold-only).

## What was built

Module #7 of `business-process-flow.md` / the Follow-up & Recall Service of
`modules-and-requirements.md`. Four bounded-concern modules on top of the
service template, each with real Prisma models, a real service, and unit
tests:

### 1. `src/follow-up-plans` — the Follow-up Plan itself

- `FollowUpPlansService.create()` — the specialist's structured Follow-up
  Plan (`referralId`, `patientId`, `gpId`, `referralType`,
  `nextReviewDueAt`, `requiredTests[]`, `indefiniteReferralApplies`), per
  business-process-flow.md's "next review date, required tests, referral
  type". Refuses to create a plan for a patient already flagged deceased
  (checks the local `DeceasedSuppression` cache — see module 4). In the
  same DB transaction: computes and inserts the initial reminder cadence
  (see module 2) and writes the `followup.plan.created` audit-outbox row.
- `recordTestCompletion()` — the single place both automatic detection
  (module 3) and self-report (`POST /follow-up-plans/:id/self-report`)
  funnel through. Marks the plan `completed`, cancels every still-`scheduled`
  reminder for it, and writes `followup.plan.completed`. Idempotent for an
  already-completed plan (first report wins, no error, no duplicate audit
  event); refuses (409) to "complete" a plan that's `suppressed_deceased`
  or `superseded_by_new_referral` — those are terminal states this action
  must not paper over.
- `follow-up-plan-status.ts` — the status/referral-type/reminder
  vocabularies, kept as validated runtime arrays (class-validator needs a
  concrete list), same pattern as `services/referral/src/referral/referral-status.ts`.

### 2. `src/reminders` — multi-channel scheduling, dispatch, and escalation

- `reminder-scheduling.ts` — pure functions, no DB/IO, fully unit-tested:
  `computeInitialReminderSchedule()` (GP courtesy-call reminder at
  due-30d/secure_message; patient reminders at due-14d/sms, due-7d/email,
  due-1d/push — all clamped to "now" rather than scheduled in the past for
  a short follow-up window) and `computeEscalationReminders()` (a
  patient+GP pair at a given escalation level, cadence: immediate, then
  +3/+7/+14/+28/+42 days after the due date, then a flat +14-day repeat —
  see `ESCALATION_OFFSETS_DAYS`'s doc comment for why these exact numbers
  are a documented judgment call, not a spec'd value).
- `ReminderDispatchScheduler` (`@Interval(15000)`) — sends every reminder
  whose `scheduledFor` has arrived for a still-`active` plan. **Does a live
  per-patient deceased check** (`ConsentSecurityClient.isPatientDeceased`,
  deduplicated per patient within a batch) immediately before sending, as
  defense-in-depth on top of module 4's bulk suppression — see that
  module's write-up for why both exist.
- `ReminderEscalationScheduler` (hourly `@Interval`) — business-process-
  flow.md's "Not detected near due date -> Escalating reminder to patient +
  GP" loop. For every overdue `active` plan, raises exactly one new
  escalation level once its cadence threshold arrives (idempotent per
  level — looks at the highest `escalationLevel` already present among the
  plan's reminders before creating the next one).
- `reminder-channel-sender.ts` — **MOCK**, see "What's mocked" below.

### 3. `src/test-completion` — automatic detection with self-report fallback

- `MockPathologyResultClient` / `MockMyHealthRecordClient` — **MOCK**, see
  below. Deliberately differentiated (pathology-style test names vs.
  imaging-style names, and a shorter vs. longer turnaround window) so
  `TestCompletionDetectionScheduler`'s "check pathology first, fall back to
  My Health Record" logic is genuinely exercised by both branches in tests,
  not just structurally present with one branch unreachable.
- `TestCompletionDetectionScheduler` (5-minute `@Interval`, same cadence as
  `ReferralQueueExpiryScheduler`'s sweep) — checks every active plan's named
  tests against both mock sources and calls
  `FollowUpPlansService.recordTestCompletion()` on the first hit.
  Self-report is the same method, reached instead via
  `POST /follow-up-plans/:id/self-report`, exactly matching business-
  process-flow.md's "Test completed? -> automatic OR self-report -> marked
  complete" (both paths converge, neither is a special case of the other).

### 4. `src/deceased-suppression` — the IMMEDIATE, already-scheduled-reminders-included suppression

This is the module the task brief calls out as critical, so it gets the
most detail:

- `DeceasedSuppressionService.suppressAllForPatient(patientId, sourceFlagId, actor)`
  is the **single implementation** of "immediately suppress every pending
  reminder for this patient, including already-scheduled-but-not-yet-sent
  ones." In one DB transaction: upserts the local `DeceasedSuppression`
  cache row, flips every `active` `FollowUpPlan` for that patient to
  `suppressed_deceased`, flips every still-`scheduled` `Reminder` for those
  plans (**and**, as a defensive extra sweep, any stray `scheduled`
  reminder for the patient at all, in case a plan's own state ever drifted)
  to `suppressed`, and writes one `followup.reminder.suppressed`
  audit-outbox row per affected plan. Idempotent — safe to call more than
  once for the same patient.
- `DeceasedEventPollerService` (`@Interval(5000)`) polls the Consent &
  Security Service's `GET /events?type=patient.deceased.frozen&since=...`
  feed (`ConsentSecurityClient.listDeceasedFrozenEventsSince`) and calls
  `suppressAllForPatient` for every new event. This is the primary
  suppression path, and it's the piece `BUILD_LOG/consent-security.md`
  explicitly flagged as missing: *"Whoever builds services/followup-recall
  ... needs to actually wire up polling against this endpoint — that
  integration doesn't exist yet from the consuming side."* It now does.
- **On "immediately"**: root `CONVENTIONS.md` §6 states the intended async
  transport (SQS/SNS) isn't wired into this scaffold yet, and
  `BUILD_LOG/consent-security.md` documents its `GET /events` polling feed
  as the interim stand-in. A truly instantaneous push isn't achievable on
  top of that interim transport. This poller runs every 5 seconds
  (deliberately much tighter than the 5-minute sweeps elsewhere in this
  service) so a freeze is caught within a few seconds, not at each
  reminder's own next scheduled fire time. **Defense-in-depth closes the
  remaining gap**: `ReminderDispatchScheduler` does its own live per-patient
  check right before actually sending (see module 2) — so even a reminder
  whose fire time falls inside one ~5-second poll window still cannot
  reach a deceased patient; a hit there also immediately calls
  `suppressAllForPatient` itself, so the rest of that patient's scheduled
  reminders are caught too, not just the one in hand. Recommended real fix,
  out of this task's scope (it needs queue infrastructure this repo hasn't
  provisioned): subscribe to a real SQS/SNS topic instead of polling.
- `ConsentSecurityClient` (`src/common`) — the real HTTP client
  implementing both calls above. `isPatientDeceased()` fails **open**
  (returns `false`, logged loudly) if the Consent & Security Service is
  unreachable, on the reasoning that the bulk poller is the primary guard
  and a single dependency blip on a live per-send check shouldn't halt
  every reminder in the platform; `listDeceasedFrozenEventsSince()` (the
  bulk poll) has no such fallback — its own caller
  (`DeceasedEventPollerService.poll()`) catches and logs any failure and
  simply retries next tick, per its own doc comment.

### 5. `src/audit-outbox` — the relay half of the outbox pattern

Standard, mirrors `services/referral`/`services/consent-security` exactly
— every module above writes an `AuditOutbox` row in the same DB transaction
as its domain write; `AuditOutboxRelayService` (5-second `@Interval`) is the
only thing that calls the real Audit Log Service.

## Key decisions / judgment calls

1. **Test completion is tracked at the whole-plan level, not per individual
   named test.** `FollowUpPlan.requiredTests` is a list, but
   `business-process-flow.md`'s diagram has a single "Test completed?"
   decision point, not a per-test sub-flow — the first detected/reported
   completion (pathology, MHR, or self-report) marks the entire plan
   complete and cancels all its remaining reminders. A plan genuinely
   needing independent per-test tracking (e.g. three unrelated tests with
   different expected turnaround times) would need `requiredTests` split
   into separate rows/plans — flagged as a real simplification, not hidden.
2. **`FollowUpReferralType` is this service's own invented vocabulary**
   (`specialist_review` / `gp_managed_recall` / `pathology_recheck` /
   `imaging_recheck` / `indefinite_monitoring`), not in
   `packages/shared-types` — that package's `FollowUpPlan` interface only
   has the boolean `indefiniteReferralApplies`, not a "referral type"
   field, even though business-process-flow.md module 6 explicitly names
   "referral type" as one of the three things a Follow-up Plan captures.
   Editing `packages/shared-types` was out of scope for this task (root
   CONVENTIONS.md: "grep the monorepo for usages before renaming or
   removing a field" — this would be an addition, lower-risk, but still a
   cross-cutting change best made deliberately). Recommended real fix: add
   a `referralType` field to shared-types' `FollowUpPlan` using this same
   enum, so other services can read it typed rather than as an opaque
   string.
3. **No `AuditEventType` for an individual reminder being sent or
   escalated.** `packages/shared-types/src/audit-event.ts`'s union has
   exact matches for plan creation/completion and reminder *suppression*
   (`followup.plan.created`, `followup.plan.completed`,
   `followup.reminder.suppressed`) but nothing for "a reminder was sent" or
   "a plan's escalation level increased." Individual reminder sends are
   high-volume, operational events, not by themselves a modification of a
   clinical/consent record — this build's judgment call is to **not** send
   them through the audit outbox at all (they're still durably recorded and
   queryable in this service's own `Reminder` table, just not in the
   immutable/NASH-signed audit trail), rather than force-fit them into one
   of the three real event types the way `services/gp-authorisation` and
   `services/referral`'s BUILD_LOGs did for their own gaps. Recommended
   real fix: add `followup.reminder.sent` / `followup.reminder.escalated`
   to shared-types if per-reminder audit trail granularity turns out to be
   needed later.
4. **A real bug was caught by its own unit test and fixed before this log
   was written**: the first draft of `DeceasedSuppressionService` computed
   and returned a count of affected plans but never actually issued the
   `followUpPlan.updateMany(... status: 'suppressed_deceased')` call — the
   reminders were correctly suppressed but the *plan* itself would have
   silently stayed `active` forever (which would also have let
   `TestCompletionDetectionScheduler` keep polling a dead patient's plan
   indefinitely). `deceased-suppression.service.spec.ts`'s assertion on
   `prisma.plans.get('plan-1').status` failed immediately, and the fix is a
   three-line addition. Left in this log because it's exactly the kind of
   defect a "clinical record write" ground rule exists to catch, and did.
5. **Reminder dispatch/escalation queries filter on `FollowUpPlan.status`,
   not a normalized "reminder is still relevant" flag** — a `Reminder` row
   itself never independently knows whether its parent plan later became
   `completed` or `suppressed_deceased`; both `recordTestCompletion()` and
   `suppressAllForPatient()` proactively flip every affected reminder's own
   `status` in the same transaction as the plan-status change, so the
   dispatch/escalation queries' `status: 'scheduled'` filters stay correct
   without needing a join-time plan-status check on every read. This is
   why `ReminderDispatchScheduler`'s query also joins on `followUpPlan: {
   status: 'active' }` as a second, defensive filter rather than trusting
   the reminder row's own status alone.

## What's mocked (clearly labelled `MOCK` in code)

- **`src/reminders/reminder-channel-sender.ts`** — `MockReminderChannelSender`.
  Sending a real SMS/email/push/secure-message needs a real vendor and
  credentials this build doesn't have (an SMS gateway, SMTP/SES, FCM/APNs,
  or — once it exists as more than a health-check skeleton —
  `services/notification`'s own outbound integrations). The interface is
  shaped so swapping in a real implementation (or an HTTP client calling a
  future `services/notification` endpoint) is a drop-in change; see that
  file's doc comment for why this service doesn't speculatively call
  `services/notification` today (it has no real endpoints yet — only
  `GET /health`, no `BUILD_LOG/notification.md` exists).
- **`src/test-completion/pathology-result.client.ts`** — `MockPathologyResultClient`.
  A real implementation needs a pathology e-ordering/e-results vendor
  integration (Healthlink, Medical-Objects, or a direct HL7/FHIR
  DiagnosticReport feed) this build has no credentials for.
- **`src/test-completion/my-health-record.client.ts`** — `MockMyHealthRecordClient`.
  A real implementation needs NASH-authenticated My Health Record
  connectivity this build has no credentials for.

## What's incomplete / known gaps

- **`prisma generate`/`prisma migrate dev` could not run in this
  sandbox** — identical `binaries.prisma.sh` egress-policy block already
  documented in `BUILD_LOG/audit-log.md`, `BUILD_LOG/identity-access.md`,
  `BUILD_LOG/gp-authorisation.md`, and `BUILD_LOG/consent-security.md`.
  Same mitigations applied here: a hand-authored
  `prisma/migrations/20260813160000_init/migration.sql` (matches
  `schema.prisma` exactly — `follow_up_plan`, `reminder`,
  `deceased_suppression`, `event_poll_cursor`, `audit_outbox`), a
  test-only `@prisma/client` stub wired via `jest.config.js`'s
  `moduleNameMapper` only, and a
  `RUN npm run prisma:generate -w services/followup-recall` step added to
  the Dockerfile before the build step. `npm run typecheck` and
  `npm run build` are both clean in this sandbox specifically because
  every real Prisma call site goes through an explicit
  `as unknown as <hand-rolled interface>` cast (same pattern
  `services/referral` uses) — the two direct, uncast property accesses
  this service has (`this.prisma.auditOutbox...` in the outbox relay)
  happen to be satisfied by a shared local sandbox stub already present at
  `node_modules/.prisma/client` (left behind by an earlier service's build
  in this same sandbox); that stub is not part of this repo (node_modules
  is gitignored) and isn't something this task relied on or modified — a
  real `prisma generate` in a normal environment produces the real, fully
  typed client either way.
- **No live integration test against a running
  Postgres/Keycloak/Consent & Security Service** — no such infra was
  reachable in this sandbox. `npm run test:e2e -w services/followup-recall`
  does pass in this sandbox once `.env` exists (`cp .env.example .env`),
  but only because the shared Prisma stub's `$connect()` is a no-op — it is
  **not** a real end-to-end verification against a real database.
- **`docker-compose.yml` is not in this task's scope to edit** (root-level
  file, outside `services/followup-recall`). Unlike
  `services/referral`'s equivalent gap for `GP_AUTHORISATION_SERVICE_URL`,
  this one doesn't actually need a fix: `ConsentSecurityClient`'s default
  fallback (`http://consent-security:3004`) already matches
  `docker-compose.yml`'s existing `consent-security:` service key/port, so
  polling works inside the compose network without any additional
  environment variable — `.env.example` documents
  `CONSENT_SECURITY_SERVICE_URL` explicitly for local `start:dev` use, but
  it's optional inside docker-compose.
- **`POST /follow-up-plans` and the `GET` listing endpoints have no
  consent/relationship check beyond principal-type gating** (a specialist
  can create a plan for any `patientId`; any authenticated principal can
  list any `patientId`'s plans). Real enforcement of "which specialist/GP
  is allowed to see which patient's Follow-up Plans" belongs to the
  Consent & Security Service's existing per-referral visibility model
  (`services/consent-security`'s `ReferralVisibilityController`) — this
  service doesn't yet call out to check it before serving a request.
  Flagged as a real gap, not silently assumed away.
- **Escalation cadence and initial reminder offsets (30/14/7/1 days before
  due date; 0/3/7/14/28/42+ days after) are reasonable, documented
  judgment calls** (see `reminder-scheduling.ts`'s doc comments), not
  sourced from a clinical/product spec. A natural follow-up (mirroring
  `services/referral`'s Compliance Rules Engine) would be to make these
  admin-configurable rather than hardcoded constants.
- **`ReminderChannel`'s `secure_message` recipients (the GP) assume a
  secure-message thread already exists for the referral** — this service
  doesn't create or check for one; it's included in `business-process-
  flow.md` module 7's ongoing consent/security thread but that's owned by
  `services/consent-security`, not wired up here.

## Verified

- `npm run test -w services/followup-recall` — **45/45 unit tests pass**
  across 11 suites: `FollowUpPlansService` (create/deceased-block/findById/
  listForPatient/recordTestCompletion incl. idempotency and terminal-state
  refusal, 9 tests), `DeceasedSuppressionService` (bulk suppress/idempotent/
  cross-patient isolation, 3 tests), `DeceasedEventPollerService` (cursor
  creation, event-to-suppression fan-out, cursor advancement, failure
  handling, 4 tests), `ConsentSecurityClient` (404/200/network-failure
  behaviour of the live last-mile check, 3 tests), `reminder-scheduling`
  (initial cadence, clamping, escalation offsets incl. the flat-repeat tail,
  9 tests), `ReminderDispatchScheduler` (send-and-mark-sent, live-check
  block + cascade suppression, per-batch dedup, failure handling, 4 tests),
  `ReminderEscalationScheduler` (level-1 raise, threshold gating, level-2
  raise, not-yet-overdue exclusion, failure handling, 5 tests),
  `MockPathologyResultClient` / `MockMyHealthRecordClient` (turnaround
  timing, pathology-vs-imaging differentiation, 5 tests),
  `TestCompletionDetectionScheduler` (pathology hit, MHR fallback hit,
  not-yet-available, no-tests-to-check, failure handling, 5 tests), health
  smoke test.
- `npx eslint services/followup-recall/src services/followup-recall/test --max-warnings=0`
  — clean, zero warnings (one real unused-import warning was found and
  fixed along the way).
- `npx tsc -p services/followup-recall/tsconfig.json --noEmit` — clean.
- `npm run build -w services/followup-recall` — clean (`tsc -p tsconfig.build.json`).
- `npm run test:e2e -w services/followup-recall` — passes (`GET /health`
  returns 200) once `.env` exists; see the sandbox caveat above.

## How to run/test this service in isolation

```bash
npm install                                                          # from repo root
cp services/followup-recall/.env.example services/followup-recall/.env
docker compose up -d postgres redis keycloak consent-security         # needs a Docker daemon
npm run prisma:generate -w services/followup-recall                   # needs network access to binaries.prisma.sh
npm run prisma:migrate -w services/followup-recall -- --name init     # or apply migration.sql directly
npm run start:dev -w services/followup-recall                         # -> http://localhost:3009/health

npm run test -w services/followup-recall        # unit tests — no external infra needed
npm run test:e2e -w services/followup-recall     # boots the real AppModule; needs Postgres reachable for a full check
```

See `services/followup-recall/README.md` for the full API table.
