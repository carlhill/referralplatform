# BUILD_LOG: gp-authorisation-service

2026-08-13 — initial real implementation (previously scaffold-only).

## What was built

- **`GpLink` Prisma model + full push-approval lifecycle** (`src/gp-links/`)
  — module 1B of `business-process-flow.md`: a GP not yet linked to a
  patient's account must get patient approval before creating a referral.
  - `POST /gp-links` — an HPI-O/NASH-authenticated practice system requests
    a link. Idempotent if the link is already `approved`; rejects a
    duplicate `pending_patient_approval` request for the same
    patient/GP pair.
  - `POST /gp-links/:id/approve` / `.../decline` — patient/carer/staff
    action. `approve` is **step-up gated** (root `CONVENTIONS.md` §8 names
    this as a worked example) and re-checks the approval window hasn't
    expired before applying.
  - `POST /gp-links/:id/revoke` — the "linked GPs — revoke" control the
    Consent & Security Service's consent page proxies to (see
    `services/consent-security/src/linked-gps`).
  - `GET /gp-links/authorisation?patientId=&gpId=` — **the actual
    enforcement point** for "block referral creation until approved." The
    Referral Service is expected to call this before creating a referral
    for a GP not already known to be linked.
  - Supports multiple concurrently linked GPs per patient (no uniqueness
    constraint beyond one non-terminal link per patient/GP pair).
- **Urgent-bypass escalation** (`requestLink` with `urgentEscalation: true`
  + required `urgentJustification`): per
  `minors-multigp-exception-paths.md` section 3's "urgent-case escalation
  option," the link is auto-approved immediately (so the GP can create the
  referral without waiting on patient response) rather than left pending —
  documented judgment call, since the doc names the option but doesn't
  specify its exact mechanics. It's still fully audited
  (`payload.autoApproved: true`) and revocable by the patient afterwards
  like any other link, so the patient retains retrospective control.
- **Stale-link expiry**: `GpLinksService.checkAuthorisation()` lazily
  expires a pending link past its 2-day window on read;
  `GpLinkExpiryScheduler` (a `@nestjs/schedule` `@Interval`, every 5
  minutes) proactively sweeps the same condition so a link never sits
  silently "pending" forever even if nobody happens to query it.
- **`HpioNashAuthGuard` + `src/common/mock-nash-auth.ts`** — **MOCK, clearly
  labelled — replace with real integration.** Enforces "only HPI-O/
  NASH-authenticated practice systems can request a link" by checking (a)
  the caller's Keycloak token asserts `principalType` `'gp'`/`'system'` and
  (b) the supplied `practiceHpiO` is 16 numeric digits (the Healthcare
  Identifiers Service's published HPI-O format). Real NASH auth needs a
  mutual-TLS certificate check at the ingress/gateway layer plus a live
  HPI-O status lookup (the intended home is the Integration & FHIR Gateway
  service) — neither is available in this build.
- **Outbox pattern for every write** (`src/audit-outbox/`) — every `GpLink`
  state transition writes an `AuditOutbox` row in the same Prisma
  `$transaction` as the domain write; `AuditOutboxRelayService` (another
  `@nestjs/schedule` `@Interval`, every 5s) is the only thing that actually
  calls the Audit Log Service, retrying indefinitely (logged, not thrown)
  on failure so a transient outage delays publication without losing the
  event.
- **Step-up enforcement** (`src/common/step-up.ts`) — a deliberate,
  documented duplicate of
  `services/identity-access/src/common/step-up/step-up.ts` (see that
  file's own doc comment on why it isn't shared yet, and this file's
  comment recommending promotion to `packages/auth-client` next time
  either service is touched). Gates `POST /gp-links/:id/approve`.

## Key decisions / judgment calls

1. **Urgent-bypass semantics** — see above. Auto-approve + audit +
   patient-revocable, rather than e.g. a time-limited grace period. This
   felt truest to "the GP can proceed for genuinely urgent cases" while
   keeping the patient in ultimate control.
2. **No dedicated "link expired" `AuditEventType`.**
   `packages/shared-types/src/audit-event.ts`'s `AuditEventType` union has
   `gp.link.requested` / `gp.linked` / `gp.link.declined` /
   `gp.link.revoked` but nothing for a silent timeout. Reusing
   `gp.link.declined` with `payload.reason: 'expired_no_response'` is the
   closest accurate fit without editing a shared package outside this
   service's scope (editing `packages/shared-types` was out of bounds for
   this task) — the audit-log service's `CreateAuditEventDto` validates
   `type` against a fixed list (`AUDIT_EVENT_TYPES` in
   `services/audit-log/src/audit-events/dto/create-audit-event.dto.ts`), so
   using a made-up type would have made every such outbox row fail to
   relay forever. Recommended real fix: add `gp.link.expired` to the
   shared union (additive, per that file's own doc comment) and to
   `AUDIT_EVENT_TYPES`.
3. **Prisma model named `GpLink`, not `GPLink`** — Prisma's client-property
   naming lowercases only the model's first character, so `GPLink` would
   produce the awkward `prisma.gPLink`; `GpLink` produces
   `prisma.gpLink`. The shared-types domain interface (`GPLink`) is
   unaffected — it's a different, unrelated name in a different package.
4. **Model relationships are opaque strings, not Prisma foreign keys** —
   `patientId`/`gpId` reference entities owned by other services
   (Onboarding & Account, GP portal/Identity & Access). Per root
   `CONVENTIONS.md` §6/§5, a service never reads another service's schema
   directly, so there's nothing to `@relation` to.

## What's mocked

- `src/common/mock-nash-auth.ts` + `HpioNashAuthGuard` — see above. Format-
  validation stands in for a real NASH mTLS certificate check + HI Service
  HPI-O status lookup.

## What's incomplete / known gaps

- **`prisma generate`/`prisma migrate dev` could not run in this sandbox** —
  `binaries.prisma.sh` is blocked by outbound egress policy (confirmed via
  `curl $HTTPS_PROXY/__agentproxy/status`: `connect_rejected`, "gateway
  answered 403 to CONNECT," identical to the already-documented gap in
  `BUILD_LOG/audit-log.md` and `BUILD_LOG/identity-access.md`). Consequences
  and mitigations, mirroring those two services' approach exactly:
  - `prisma/migrations/20260813130000_init/migration.sql` is hand-authored
    to match `schema.prisma`'s `GpLink`/`AuditOutbox` models — not applied
    against a real Postgres in this sandbox (no reachable Postgres either).
    Run `npm run prisma:migrate -w services/gp-authorisation -- --name init`
    once network access to `binaries.prisma.sh` is available.
  - `npm run typecheck -w services/gp-authorisation` fails with exactly the
    errors you'd expect from a missing generated client (`Property 'gpLink'
    does not exist on type 'PrismaService'`, `Property '$transaction' does
    not exist`, etc.) — nothing else. Verified by grepping the error output
    for anything *not* matching "does not exist on type 'PrismaService'":
    zero results.
  - `npm run test:e2e -w services/gp-authorisation` fails to compile for the
    same reason (it boots the real `AppModule`, which needs a real
    `@prisma/client`). Not run end-to-end in this sandbox.
  - `jest.config.js` maps `@prisma/client` to
    `test/stubs/prisma-client.stub.ts` for unit tests only (documented at
    length in that file) — the Dockerfile/build/start paths resolve the
    real package. **Fixed the Dockerfile** to add
    `RUN npm run prisma:generate -w services/gp-authorisation` before the
    build step (the original scaffold Dockerfile skipped straight to
    `npm run build`, which would fail once real Prisma-backed code exists —
    same class of fix `BUILD_LOG/audit-log.md` already made for that
    service).
- **`docker-compose.yml`'s `gp-authorisation:` environment block doesn't set
  `STEP_UP_ACR`** — it'll fall back to this service's own default
  (`'passkey'`, same as `.env.example`), so it's not broken, just worth
  noting for whoever owns that file (out of this task's scope to edit
  directly).
- **No live integration test against a running Keycloak/Postgres** — same
  "no Docker daemon in this sandbox" constraint documented in every other
  service's BUILD_LOG so far.
- **The Referral Service doesn't yet call `GET /gp-links/authorisation`** —
  that integration point is real and tested from this service's side, but
  whoever builds `services/referral`'s referral-creation flow needs to
  actually call it (and handle `authorised: false` by blocking creation,
  per `claude/modules-and-requirements.md`'s GP Authorisation requirement).

## Verified

- `npm run test -w services/gp-authorisation` — **26/26 unit tests pass**:
  `GpLinksService` (create/idempotency/duplicate-rejection/urgent-bypass/
  approve/decline/revoke/authorisation-check/expiry, 15 tests),
  `AuditOutboxRelayService` (publish success, failure leaves row
  unpublished and doesn't throw, skips already-published rows, 3 tests),
  `assertStepUp` (4 tests), `mock-nash-auth` (format validation, 2 tests +
  parameterised cases), health smoke test (2 tests, unit + e2e-shaped).
- `npx eslint services/gp-authorisation/src services/gp-authorisation/test --max-warnings=0`
  — clean, zero warnings.
- `npx tsc -p services/gp-authorisation/tsconfig.json --noEmit` — clean
  except the Prisma-codegen-dependent errors explained above (verified via
  grep, see "What's incomplete").

## How to run/test this service in isolation

```bash
npm install                                                      # from repo root
cp services/gp-authorisation/.env.example services/gp-authorisation/.env
docker compose up -d postgres redis keycloak                     # needs a Docker daemon
npm run prisma:generate -w services/gp-authorisation             # needs network access to binaries.prisma.sh
npm run prisma:migrate -w services/gp-authorisation -- --name init   # or apply migration.sql directly
npm run start:dev -w services/gp-authorisation                   # -> http://localhost:3003/health

npm run test -w services/gp-authorisation        # unit tests — no external infra needed
npm run test:e2e -w services/gp-authorisation    # needs the docker-compose infra + a generated Prisma client
```

See `services/gp-authorisation/README.md` for the full API table.
