# BUILD_LOG: booking-service

2026-08-13 — initial real implementation (previously scaffold-only). Module #9 of
modules-and-requirements.md / module 4 of business-process-flow.md — flagged as
"the single largest module in the whole platform, per the cost breakdown," so this
entry is longer than most; read the "Concurrency-safe slot booking" section first if
you're short on time, it's the part the task was built around.

## What was built

### 1. Calendar sync — `src/calendar/`

- `calendar-client.interface.ts` — the clean `CalendarClient` interface
  (`listFreeBusy`/`createEvent`/`deleteEvent`) every provider integration
  implements, per specialist-directory-booking.md's explicit recommendation:
  "standard calendar-sharing protocols, not PMS integration ... design this as
  two-way, not read-only, from the start."
- `mock-calendar.client.ts` — **MOCK, replace with a real integration** (Google
  Calendar API / Microsoft Graph / a CalDAV client library) before any production
  traffic touches this service. Simulates realistic AU clinic-hours availability
  (weekdays 09:00–17:00, 30-minute slots) with a deterministic pseudo-random ~25%
  of slots pre-busy per calendar id (so sync produces varied but
  reproducible-in-tests availability), and a real in-memory event store so
  `createEvent`/`deleteEvent` genuinely affect the next `listFreeBusy` call.
- `calendar-client.factory.ts` — the one place that resolves mock-vs-real per
  provider; every caller goes through this, never a concrete client directly, so
  swapping in a real integration later is a one-file change.
- `calendar-sync.service.ts` — pulls free/busy and upserts (create-if-not-exists
  only) `Slot` rows. **Documented scope limit**: sync only ever adds new open
  slots, never deletes/force-closes an existing `Slot` row even if the calendar no
  longer reports that window free — a real implementation would reconcile
  removals too, carefully (not yanking a slot out from under a patient actively
  confirming it). Out of scope for this build's golden path; doesn't affect the
  concurrency guarantee either way (confirmSlot only ever succeeds against a row
  this service's own DB currently has `status = 'open'`).
- `calendar-sync.scheduler.ts` — `@nestjs/schedule` `@Interval` sweep, every 5
  minutes, syncing every connected calendar. Also triggerable on demand via
  `POST /calendar-connections/:specialistId/sync`.
- `calendar-connections.controller.ts` — `POST /calendar-connections` (connect/
  re-point), `GET /calendar-connections/:specialistId`, `POST
  /calendar-connections/:specialistId/sync`.

### 2. Preference capture + matching — `src/booking/slot-matching.ts`, `slots.service.ts`

Pure-function ranking (`rankSlotsByPreference`), kept separate from any I/O so it's
trivially unit-testable: day+time-of-day match ranks highest, then day-only, then
time-only, then soonest-first as a universal fallback (never leaves a patient with
zero options just because nothing fits perfectly) — the differentiator
specialist-directory-booking.md calls out explicitly: "the day-of-week/time-of-day
preference-driven matching idea is more specific than what Zocdoc's search does
today." AU clinic-hours time bands (morning/afternoon/evening) are a **documented
judgment call** — not specified by any project doc, arbitrary but reasonable
06:00–12:00 / 12:00–17:00 / 17:00–21:00 split.

With no preference at all (both fields undefined), ranking degrades to a flat
soonest-first list — this is exactly how the urgent fast-path gets "earliest
available slot offered directly" for free, by calling the same ranking function
with no preference rather than a separate code path.

### 3. Concurrency-safe slot booking — `src/booking/slot-claim.service.ts` (read this one)

**This is the part the task is built around.** `SlotClaimService.claim(bookingId,
slotId, actor)` is the single, shared, concurrency-safe "claim this open slot"
operation every confirmation path funnels through (the auto-match loop, manual
reception/GP slot proposals, and waitlist auto-claim — see below for why it's its
own service rather than a method on `BookingService`).

**The mechanism**: one atomic SQL statement —

```sql
UPDATE slot SET status = 'booked', "bookingId" = $1, version = version + 1
WHERE id = $2 AND status = 'open'
```

— issued via Prisma's `updateMany({ where: { id: slotId, status: 'open' }, data:
{...} })` inside a `$transaction`, checking `result.count`. **Not** application-level
locking, **not** a separate `findUnique` (read) followed by `update` (write) — that
two-step pattern is exactly the TOCTOU race a naive implementation would fall into.
Postgres holds a row lock for the UPDATE statement's duration; a second, truly
concurrent transaction attempting the same UPDATE against the same row blocks on
that lock until the first commits, then re-evaluates its own `WHERE status = 'open'`
against the now-committed row — which no longer matches — and affects zero rows.
That's the entire guarantee. `confirmSlot`/`create`'s auto-match loop treats a
`ConflictException` from a lost race as an ordinary "try the next candidate" signal,
not an error — losing a race is an expected, handled outcome, not a bug.

**Two independent layers of proof, both passing, both required reading before
touching this code:**

1. **`src/booking/slot-claim.service.spec.ts`** — in-process, using a hand-rolled
   `FakePrisma` (`test/stubs/fake-prisma.ts`). Read that file's doc comment: every
   simulated DB call genuinely `await`s a real event-loop turn (`setImmediate`)
   before touching data, so `Promise.all([...manyClaimAttempts])` produces genuine
   interleaving between separate DB calls — a naive read-then-write implementation
   WOULD race and double-book under this fake. Only `updateMany`'s own internal
   compare-and-swap is a single non-yielding step, deliberately mirroring a real
   `UPDATE ... WHERE` statement's atomicity — no more, no less. The core test fires
   25 concurrent `claim()` calls (different bookings) at the same slot: exactly 1
   wins, 24 get `ConflictException`, the slot's `version` increments exactly once
   (not once per attempt), exactly one `booking.confirmed` audit row is written.
2. **`test/slot-concurrency.e2e-spec.ts`** — the stronger proof: runs the literal
   SQL above directly against this **sandbox's real local Postgres instance** (not
   a fake — `psql` is available and a real Postgres was already running and
   reachable at `localhost:5432` with the right credentials in this sandbox), using
   many genuinely separate OS-level `psql` subprocesses (separate TCP connections,
   separate Postgres backends) fired concurrently via `Promise.all`. This can't be
   an artifact of JS's single-threaded scheduling — it's actually-parallel client
   connections racing a real database. 20 concurrent attempts on the same row → 1
   winner, 19 `UPDATE 0`s, final `version = 1`. Sanity-checked that this test is
   genuinely meaningful (not vacuous) by manually running the same 20-concurrent-
   attempt harness with the `AND status = 'open'` guard removed: **all 20 "won"**
   (see this file's own comments) — confirming the test would catch a real
   regression, not just pass trivially.
   - Why via `psql` subprocesses rather than this service's own generated Prisma
     client: see "Known sandbox limitation" below — `prisma generate` can't run
     here. This test only depends on `psql` + a reachable Postgres with the
     `booking.slot` table migrated (which this build's hand-authored migration
     WAS applied to, directly, in this sandbox — see migration file's header
     comment), so it's a real, independent, environment-portable proof, not a
     sandbox-only workaround masquerading as one.
   - Skips cleanly (with a loud `console.warn`, not a silent no-op) rather than
     hard-failing if Postgres isn't reachable in some other environment running
     this suite.

`SlotClaimService` is deliberately its own class (not folded into `BookingService`)
so `BookingService` and `WaitlistService` (both of which need to claim slots) can
each depend on it **one-directionally** — avoids a circular Nest provider
dependency that an earlier draft of this design hit (`BookingService` needs
`WaitlistService` for the waitlist fallback; `WaitlistService` needs to claim slots
too — resolved by extracting the shared claim primitive rather than having either
service depend on the other).

### 4. Booking orchestration — `src/booking/booking.service.ts`

- `create()` — captures preference (or urgent flag), then `matchAndConfirm`: tries
  up to 5 ranked candidates via `SlotClaimService.claim`, treating a lost race as
  "try the next one," falling back to the waitlist if every candidate is taken —
  the exact branch business-process-flow.md module 4 draws.
- `confirmSlot()` — the manual entry point for reception/GP "proposing specific
  slots" (specialist-directory-booking.md: "here are three that fit, pick one"),
  thin wrapper delegating to `SlotClaimService.claim`.
- `cancel()` — releases the claimed slot back to `open`, deletes the calendar
  event (mock write-back), **dual notification** (patient AND GP — GP id looked
  up best-effort from the Referral Service via the new `ReferralClient`), then
  immediately calls `WaitlistService.fillFromOpenSlots` on the just-released slot.

### 5. Waitlist — `src/waitlist/waitlist.service.ts`

`addToWaitlist` / `fillFromOpenSlots` — walks waiting entries oldest-first,
best-matching-slot-first, auto-claiming via the same `SlotClaimService.claim` every
other path uses (so a waitlist auto-claim can never double-book either). **Documented
simplification**: auto-claims immediately rather than a notify-and-hold-a-claim-
window UX (so a patient asleep at 2am doesn't lose a just-released slot to someone
else before they can respond) — that needs a `WaitlistOffer` sub-state machine with
an expiry sweep, a reasonable v2 addition that wasn't needed to prove the core
waitlist-management/auto-fill mechanics this build's golden path targets. The mock
notification still fires either way, honestly worded as "you were auto-matched," not
"you have N minutes to claim this."

### 6. Notification & Referral Service integration — `src/common/`

- `notification.client.ts` — **MOCK, replace with a real call to the Notification
  Service** once it exists. As of this build, `services/notification` is still a
  bare scaffold (health check only, no send endpoint) — calling it would just
  404, so rather than pretend an integration exists, this logs exactly what a real
  `POST /notifications` call would carry (same recipients/event/subject/message
  shape), so swapping in the real HTTP call later is a one-method change.
- `referral.client.ts` — a **real** wired integration: `markBooked()` calls the
  Referral Service's actual `POST /referrals/:id/book` (that controller's own doc
  comment says "Called by the Booking Service once a slot is confirmed" — this is
  that wiring, now done, mirroring the exact gap-closing pattern
  BUILD_LOG/referral.md used for `GpAuthorisationClient`). `getReferral()` is a
  best-effort `GET /referrals/:id` lookup used only for the cancellation dual-
  notification's GP id. Both are best-effort/non-blocking on failure — a booking
  is already durably confirmed by the time either is called, so a Referral Service
  outage must not roll back a real, already-true booking; failures are logged
  loudly for ops reconciliation instead.
  - `docker-compose.yml`'s `booking:` service block doesn't yet set
    `REFERRAL_SERVICE_URL` (root-level file, outside this task's scope to edit
    directly — see `.env.example`'s comment). Falls back to the docker-compose
    network hostname `http://referral:3005` if unset, so it still works once that
    line is added, same pattern `gp-authorisation.client.ts` used for referral.

### 7. Audit — outbox pattern, per root CONVENTIONS.md §7

`AuditOutbox` table + `AuditOutboxRelayService` (`@Interval(5000)` cron), identical
pattern to `services/referral`. **Judgment call on scope**: only `booking.confirmed`
and `booking.cancelled` are written as audit events — the two `AuditEventType`s
shared-types actually defines for the Booking subject family
(`packages/shared-types/src/audit-event.ts`). Intermediate states (a booking
created as `preference_captured`, joining the waitlist) are NOT separately audited.
Reasoning: unlike `referral.service.ts`'s precedent of reusing a semantically-close
type (`referral.created`) with a `payload.event` disambiguator for events with no
exact match, there's no reasonably-close donor type for "booking record created but
nothing yet decided" in the Booking family — reusing `booking.confirmed` for a
not-yet-confirmed event would be actively misleading to anyone querying the audit
log. Read as: the audit design's own event-type registry already scopes booking
auditing to real confirm/cancel decisions, not scheduling-negotiation metadata. If a
future need arises to audit preference-capture/waitlist-join specifically,
`shared-types` needs new event types added first (a cross-cutting change, out of
this task's scope).

### 8. Endpoints

- `POST /bookings`, `GET /bookings`, `GET /bookings/:id`
- `GET /bookings/:id/candidate-slots` — ranked open slots for a booking's current
  preference profile (reception/GP proposal support)
- `POST /bookings/:id/confirm` — the concurrency-critical operation
- `POST /bookings/:id/cancel`
- `GET /specialists/:specialistId/slots` — read-only visibility, optional
  `preferredDayOfWeek`/`preferredTimeOfDay` query params for ranked results
- `POST /calendar-connections`, `GET /calendar-connections/:specialistId`,
  `POST /calendar-connections/:specialistId/sync`

## Data model — `prisma/schema.prisma`

`CalendarConnection` (one per specialist — **documented simplification**: a
specialist with multiple real calendars would need multi-calendar support in a
future iteration), `Slot` (the concurrency-critical table — `@@unique([specialistId,
startsAt])` prevents duplicate slots on repeated sync; `bookingId String? @unique`
— Postgres treats multiple NULLs as distinct in a unique index, so many
simultaneously-open slots can all have `bookingId = null`, which is exactly what's
needed), `Booking` (mirrors `packages/shared-types/src/booking.ts`'s `Booking`
interface — that's the cross-service contract, this table is this service's storage
of it), `WaitlistEntry`, `AuditOutbox`.

**Two-state `Slot.status` model** (`open` | `booked`, no separate `held`/
`cancelled`): a released slot goes straight back to `open` for reuse rather than
through an intermediate state — kept deliberately simple; `Booking.status` already
carries the richer state machine (`preference_captured` | `waitlisted` | `confirmed`
| `cancelled` | `completed`) so the slot itself only needs to answer "is this
specific calendar window currently spoken for or not."

## Known sandbox limitation (identical, already-documented pattern across this build)

`prisma generate`/`prisma migrate dev` cannot reach `binaries.prisma.sh` (outbound
egress policy blocks it — confirmed via the agent proxy status endpoint as a policy
denial, not transient — same as `BUILD_LOG/referral.md`, `BUILD_LOG/audit-log.md`,
`BUILD_LOG/gp-authorisation.md`, `BUILD_LOG/identity-access.md`). Consequences,
all handled the same way those services handled them:

- `prisma/migrations/20260813180000_init/migration.sql` is **hand-authored** to
  match `schema.prisma` exactly, rather than generated. Unlike those other
  services, this one's migration **was actually applied** directly (via `psql`) to
  this sandbox's real local Postgres instance (`booking` schema, already created
  empty by `infra/postgres/init-schemas.sql`) — used to run the real-DB
  concurrency proof described above.
- `test/stubs/prisma-client.stub.ts` + `jest.config.js`'s `moduleNameMapper` — a
  sandbox-only substitute so unit tests can run without a generated client (not
  used by the Dockerfile/build/start, which resolve the real package normally).
  Same fix additionally applied to `jest.e2e.config.js` (this service's
  `AppModule` now pulls in real Prisma-model-typed services, unlike the
  scaffold-only state `jest.e2e.config.js` was originally written against — this
  same gap exists un-fixed in `services/referral/jest.e2e.config.js` today; fixed
  here so this service's own e2e suite can actually run).
- `npm run typecheck -w services/booking` fails with ~20 `TS2339`/`TS2345` errors,
  all of the form "Property 'slot'/'booking'/'waitlistEntry'/'calendarConnection'
  does not exist on type 'PrismaService'" — because `tsc` (unlike `ts-jest` with
  the stub mapping) resolves the real, un-generated `@prisma/client` package.
  Confirmed this is identical, pre-existing, sandbox-wide behavior by running
  `npm run typecheck -w services/referral`, which fails the same way for the same
  reason. Not a bug introduced here; will resolve once `prisma generate` can run
  with real network access in a normal dev/CI environment.
- A local `.env` (gitignored, not committed) was created from `.env.example` to
  let `ConfigService.getOrThrow('KEYCLOAK_ISSUER')` etc. resolve during
  `npm run test:e2e` — `ReferralClient`/`NotificationClient`'s constructors build
  a `ServiceTokenProvider` eagerly (same pattern as `GpAuthorisationClient`), which
  throws immediately if no Keycloak config is present at all. This is exactly the
  `cp services/booking/.env.example services/booking/.env` step this service's own
  README already documents for local dev — not a new workaround.

## Judgment calls (see inline doc comments for full reasoning; summarized here)

1. **Calendar write-back happens outside the DB transaction that claims the slot**
   (`SlotClaimService.claim`) — the atomic claim + Booking update + audit outbox
   write all commit first, in one transaction; the calendar-provider call happens
   after, best-effort. A calendar-provider hiccup must not roll back an
   already-true booking; it's logged loudly for reconciliation instead. This is a
   real design decision favoring "DB is the source of truth, external I/O never
   blocks or invalidates it" over "everything succeeds together or nothing does."
2. **Booking auto-confirms the best-ranked match rather than presenting ranked
   options for the patient to choose from**, matching business-process-flow.md's
   diagram literally ("matching slot available? -> Yes: confirmed" — no "patient
   chooses among candidates" step shown). The `GET /bookings/:id/candidate-slots`
   endpoint and the standalone `confirmSlot`/`POST /bookings/:id/confirm` endpoint
   still support the "reception proposes options" workflow
   specialist-directory-booking.md also describes — both flows are real and wired,
   not either/or.
3. **AU clinic-hours time-of-day bands** (morning 06:00–12:00, afternoon
   12:00–17:00, evening 17:00–21:00) — arbitrary, not specified anywhere, but
   reasonable and documented in `slot-matching.ts`.
4. **Waitlist auto-claims immediately rather than a notify-and-hold-a-claim-window
   UX** — see section 5 above.
5. **Audit scope limited to `booking.confirmed`/`booking.cancelled`** — see
   section 7 above.
6. **One calendar connection per specialist** — see data model section above.

## What's incomplete / known gaps

- Real Google/Outlook/CalDAV integrations — mocked, clearly labelled, behind a
  clean swappable interface (see section 1).
- Real Notification Service call — mocked (logs what it would send), because the
  Notification Service itself doesn't have a send endpoint yet in this build (see
  section 6).
- `docker-compose.yml`'s `booking:` service doesn't set `REFERRAL_SERVICE_URL` —
  falls back to the correct docker-network hostname/port, so it still works once
  added; out of this task's scope to edit that root file directly.
- Calendar sync never reconciles/removes a `Slot` row once created (section 1) —
  documented scope limit, doesn't affect the concurrency guarantee.
- No claim-window state machine for waitlist offers — auto-claims immediately
  instead (section 5).
- No pagination on `GET /bookings` / `GET /specialists/:id/slots` — fine at this
  build's scale, would need it before real production volume.

## How to run/test this service in isolation

```bash
# from the monorepo root:
npm install
cp services/booking/.env.example services/booking/.env
docker compose up -d postgres redis keycloak

npm run start:dev -w services/booking
# -> http://localhost:3007/health

npm run test -w services/booking       # unit tests, incl. the in-process
                                        # concurrency proof (slot-claim.service.spec.ts)
npm run test:e2e -w services/booking   # e2e tests, incl. the REAL-Postgres
                                        # concurrency proof (slot-concurrency.e2e-spec.ts)
                                        # — needs a reachable Postgres with the
                                        # booking.slot table migrated; skips
                                        # cleanly with a warning if unavailable
npm run lint -w services/booking       # clean
npm run typecheck -w services/booking  # fails — see "Known sandbox limitation" above
```

**Verified in this build's sandbox**: all 42 unit tests pass (8 suites), all 4 e2e
tests pass (2 suites, including the real-Postgres concurrency proof against this
sandbox's actual local Postgres instance), lint is clean (0 warnings), the
concurrency test was sanity-checked to actually be meaningful (fails/all-win when
the atomicity guard is manually removed — see section 3). `npm run typecheck`
fails for the pre-existing, sandbox-wide, already-documented Prisma-client
generation reason only — not verified end-to-end against a real generated Prisma
client or a booted `docker compose up` full stack (per this build's sandbox
network constraints, same caveat every other service in this build carries).
