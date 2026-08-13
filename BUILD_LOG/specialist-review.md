# BUILD_LOG: specialist-review-service

2026-08-13 — initial real implementation (previously scaffold-only). Covers
module #10/#5 (modules-and-requirements.md / business-process-flow.md
module 5 "Specialist review"): AI-assisted structured extraction, the
eConsult-vs-full-appointment branch, and pre-visit pathology/imaging
requests.

## What was built

### 1. `ReferralCase` intake — this service's own copy of the referral packet

`POST /cases` ingests `{ referralId, patientId, gpId, specialistId?, urgent?,
referralText, reasonForReferralHint? }`. Per root CONVENTIONS.md §6 ("a
service never reads another service's schema directly"), this service does
**not** read `services/referral`'s Postgres schema — it holds its own copy
of the referral text needed for review, pushed to it by whichever upstream
service hands a referral off once `booked` (the real caller is intended to
be the Referral or Booking Service; not yet wired from either of those
services' side — see "Known gaps" below).

### 2. Pluggable `ExtractionProvider` — the AI-assisted structured extraction

`src/extraction/extraction-provider.interface.ts` defines the interface the
task brief asked for. Two registered implementations, selected via
`EXTRACTION_PROVIDER` env var (`rule_based` default | `llm`):

- **`RuleBasedExtractionProvider`** (`rule-based-extraction.provider.ts`) —
  the real, working default. Regex/heuristic extraction of patient
  (name/DOB/sex/Medicare no.), reason for referral, key history (bulleted
  section), medications, referring GP (name/practice/provider no./contact),
  and literal urgency-keyword matches — never inferred clinical urgency,
  only phrases actually present in the text. Reports a 0-1 confidence score
  and per-field warnings when something couldn't be found. 11 unit tests
  (`rule-based-extraction.provider.spec.ts`) cover a well-formed letter,
  sparse/unstructured text, and the structured-hint fallback.
- **`LlmExtractionProvider`** (`llm-extraction.provider.ts`) — **MOCK,
  clearly labelled in-code**. Real, working request/response handling
  against any OpenAI-chat-completions-compatible endpoint (JSON-mode
  extraction prompt, credentials via `LLM_API_KEY`/`LLM_API_URL`/`LLM_MODEL`)
  — but no real LLM vendor account exists for this build, so with no
  `LLM_API_KEY` configured (the default in `.env.example`) it logs a loud
  warning and delegates to `RuleBasedExtractionProvider` instead of
  throwing. The `name` it reports (`llm-v1` vs `rule-based-v1-fallback`)
  always reflects which path actually ran. This code has been reviewed but
  **not exercised against a live vendor** in this sandbox (no credentials,
  and outbound access to most LLM vendor hosts is blocked by this
  environment's egress policy).

Both providers are pure functions of `{ referralText, reasonForReferralHint
} -> ExtractionOutput` — neither writes to the database, calls the Audit Log
Service, or triggers anything downstream. `CasesService` owns all of that,
strictly after confirmation (see next section).

### 3. The explicit-confirmation gate — the Babylon Health guardrail, enforced structurally

This is the core design constraint the whole service is built around, per
modules-and-requirements.md's exact wording: *"AI-assisted extraction
output must always be presented as a structured summary for review, never
as an auto-submitted clinical action — the specialist must explicitly
confirm before anything downstream happens, consistent with the Babylon
Health cautionary guardrails."* Concretely:

- `POST /cases/:id/extract` **only ever** creates a `pending_review`
  `ExtractionResult` row. It cannot change the case's branch, cannot create
  a pathology request, cannot touch the Referral Service. Verified by a
  dedicated test: *"never auto-actions anything — no decision or pathology
  request is created by extraction alone."*
- `POST /cases/:id/extractions/:extractionId/confirm` requires the literal
  JSON body `{ "confirmed": true }` (enforced by `class-validator`'s
  `@IsIn([true])` — there is no default-true, no "confirm all" bulk
  endpoint). It records the specialist's `edits` **separately** from the
  AI's original `structuredData` field, so the audit trail can always
  distinguish "what the AI produced" from "what the human actually attested
  was accurate" — never overwriting the original.
- `CasesService.decideBranch()` and `.requestPathology()` both call
  `requireStatus(referralCase, 'extraction_confirmed')` (or one of its
  downstream statuses for pathology) and throw `ConflictException`
  otherwise — this is checked in application code on every call, not just a
  UI-level convention. Covered by tests: *"blocks decideBranch until an
  extraction has been confirmed"*, *"blocks requestPathology until an
  extraction has been confirmed."*

### 4. The eConsult-vs-full-appointment branch

`POST /cases/:id/branch-decision` — `branch: 'econsult' | 'full_appointment'`,
`adviceText` required (class-validator `@ValidateIf`) when `branch ===
'econsult'`. Records a `SpecialistDecision` row and advances
`ReferralCase.status` accordingly (`resolved_econsult` | `full_appointment`).

**Best-effort sync to the Referral Service's own state machine.** The
Referral Service already has the exact matching transitions
(`POST /referrals/:id/review/start`, `/review/resolve-econsult`,
`/review/complete` — see `services/referral/src/referral/referral.controller.ts`),
gated to `principalType === 'specialist' || 'internal_staff'`. A
service-to-service client-credentials token (this build's normal
inter-service auth pattern, e.g. `GpAuthorisationClient`) would carry
`principalType: 'system'` and be rejected by that exact check — so
**`ReferralServiceClient` forwards the calling specialist's own bearer
token** instead (documented judgment call, see that file's doc comment).
This keeps the two services' state machines in sync without touching
`services/referral` (outside this task's scope). A sync failure (Referral
Service down, referral not actually in `booked` state, network error) is
recorded on `SpecialistDecision.referralServiceSyncStatus`/`Error` and
**never blocks or rolls back** this service's own record of the decision —
tested explicitly (*"records a failed sync without throwing or blocking the
decision"*).

### 5. Pre-visit pathology/imaging requests

`POST /cases/:id/pathology-requests` — `requestType: 'pathology' |
'imaging'`, `testsRequested: string[]`, `clinicalNotes?`. Submits via
`PathologyOrderingProvider` (DI token, one concrete implementation
registered):

- **`MockPathologyOrderingProvider`** — **MOCK, clearly labelled in-code and
  here**. Real e-ordering needs a HealthLink/Medical-Objects
  secure-messaging-vendor account (the same two vendors the platform-wide
  Secure Messaging Gateway module integrates with) — nobody has issued this
  build such an account, so there's nothing real to call. The mock
  generates a fake `MOCK-<TYPE>-<timestamp>-<n>` reference, logs it clearly
  as fake, and gives `CasesService`/the Prisma schema a real seam a future
  real integration is a drop-in replacement for (see that file's doc
  comment for exactly what a real implementation would do: build an
  HL7v2/FHIR `ServiceRequest`, sign with the practice's NASH certificate,
  transmit, return the vendor's real message id).

### 6. Audit trail — the outbox pattern

Every case-lifecycle write (case received, extraction run, extraction
confirmed/rejected, branch decided, pathology requested, case
completed/cancelled) writes an `AuditOutbox` row in the same DB transaction
as the domain write, relayed to the real Audit Log Service by
`AuditOutboxRelayService` (identical `@nestjs/schedule @Interval(5000)`
pattern to `services/referral`) — root CONVENTIONS.md §7.

**Judgment call, following an established precedent**: `AuditEventType`
(`packages/shared-types/src/audit-event.ts`) has no dedicated entries for
this service's own event types (`specialist_review.case_received`,
`.extraction.confirmed`, `.branch.decided`, `.pathology_request.created`,
`.case.completed`/`.cancelled`). Every outbox row in this service reuses
`'referral.routed'` (the closest available neighbor — "the referral's
post-routing lifecycle progressed") and disambiguates via
`payload.event`, exactly mirroring the precedent
`services/referral/src/referral/referral-status.ts`'s
`auditEventTypeForStatus()` already set for its own `in_review` /
`resolved_econsult` / `completed` statuses (see that file's doc comment).
Recommended real fix, out of this task's scope (editing
`packages/shared-types` and `services/audit-log`'s DTO): add the five event
types above to `AuditEventType` and to
`services/audit-log/src/audit-events/dto/create-audit-event.dto.ts`'s
`AUDIT_EVENT_TYPES`.

## Known gaps / judgment calls

- **Nothing in this build actually calls `POST /cases`.** The Referral
  Service (and/or Booking Service) is the intended real caller once a
  referral reaches `booked`, but wiring that call is outside `services/referral`
  and `services/booking`'s respective task scopes as much as it's outside
  this one — same shape of gap `BUILD_LOG/gp-authorisation.md` and
  `BUILD_LOG/referral.md` already flagged for their own missing callers.
  Whoever builds that integration point needs `CreateCaseDto`'s exact shape
  (see `src/cases/dto/create-case.dto.ts`).
- **`docker-compose.yml`'s `specialist-review:` block doesn't set
  `REFERRAL_SERVICE_URL` or `EXTRACTION_PROVIDER`** — out of this task's
  scope to edit that root-level file directly. Both have safe defaults
  (`http://referral:3005`, `rule_based`) matching that file's actual
  service naming, so the service still works correctly once those lines are
  added for explicitness.
- **Extraction can only run while a case is `received`/`extracted`** — once
  an extraction has been confirmed and the case has moved to
  `extraction_confirmed` or beyond, there's no "go back and re-extract"
  path in this build. A real clinical workflow might want to allow this
  (e.g. new information arrives); deliberately left out to keep the state
  machine simple for this pass — see `CasesService.runExtraction()`'s
  status check.
- **`prisma generate` could not run in this sandbox** (same, already
  documented environment limitation as `services/referral` and
  `services/gp-authorisation` — `binaries.prisma.sh` is blocked by this
  build's egress policy). `npm run build`, `npm run typecheck`, and `npm run
  test:e2e` all fail on this service for the exact same reason they already
  fail on `services/referral` (verified side-by-side — see "What was
  verified" below): `PrismaService` extends a placeholder/empty generated
  `@prisma/client`, so TypeScript can't see the real model properties
  (`referralCase`, `extractionResult`, etc.) declared in
  `prisma/schema.prisma`. This is a pre-existing, repo-wide sandbox
  limitation, not something introduced here — confirm `npm run
  prisma:generate -w services/specialist-review && npm run build -w
  services/specialist-review` succeeds in a normal dev/CI environment with
  real network access.

## What was verified

- `npm run test -w services/specialist-review` — **32/32 passing**: 11
  `RuleBasedExtractionProvider` tests (well-formed letter field-by-field,
  sparse-text warnings/low-confidence, structured-hint fallback, empty
  input), 20 `CasesService` tests (creation/duplicate rejection, extraction
  never auto-actioning anything, the confirmation gate blocking both
  downstream actions, extraction confirm/supersede/reject, both branches,
  best-effort sync success *and* failure, pathology requests, case
  completion requiring a branch decision, cancellation from valid/invalid
  states, list filtering), 1 health smoke test.
- `npm run lint -w services/specialist-review` — clean, zero warnings.
- `npm run build` / `npm run typecheck` / `npm run test:e2e` — fail with the
  Prisma-client-generation sandbox limitation described above; confirmed
  `services/referral` (the reference implementation) fails identically,
  side-by-side, for the same reason, so this is not a defect specific to
  this service.

## How to run/test this service in isolation

```bash
# from the monorepo root:
npm install
cp services/specialist-review/.env.example services/specialist-review/.env
docker compose up -d postgres redis keycloak

npm run prisma:generate -w services/specialist-review   # needs real network access, see "Known gaps"
npm run prisma:migrate -w services/specialist-review -- --name init

npm run start:dev -w services/specialist-review
# -> http://localhost:3008/health

npm run test -w services/specialist-review       # unit tests — pass today, no DB/network needed
npm run test:e2e -w services/specialist-review    # needs the real Prisma client generated first
```

See `services/specialist-review/README.md` for the full endpoint table.
