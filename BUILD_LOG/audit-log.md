# BUILD_LOG: audit-log-service

2026-08-13 — initial real implementation (previously scaffold-only).

## What was built

- **immudb wiring** (`src/immudb/immudb.service.ts`, `immudb.module.ts`) — a real
  `immudb-node` client. Writes use `verifiedSet`, reads use `verifiedGet`, both of
  which perform *client-side* cryptographic (Merkle inclusion/consistency) proof
  verification before resolving — that's the actual tamper-evidence property, not
  just "the server said ok". Deliberately does NOT use the SDK's `initClient(...,
  autoDatabase: true)` convenience path — reading the SDK's source
  (`node_modules/immudb-node/dist/src/client.js`) shows its "database already
  exists" branch calls `useDatabase` with the SDK's hardcoded default database name
  instead of the one actually requested, which would silently point every write at
  the wrong immudb database on a warm restart. Login/listDatabases/createDatabase/
  useDatabase are done explicitly instead.
- **NASH signing** (`src/signing/`) — `Signer` interface + `NASH_SIGNER` DI token +
  `MockNashSigner` (**MOCK — replace with real integration**: generates/loads a
  local Ed25519 keypair at `NASH_SIGNING_KEY_PATH` and signs the canonical
  (deterministically key-sorted, see `src/common/canonical-json.ts`) event envelope
  with it before every immudb write). Real NASH signing needs an HSM-backed
  organisation certificate and Services Australia registration, neither of which
  this sandbox has — see the doc comment in `mock-nash.signer.ts` for exactly what
  a real implementation needs to do differently.
- **Crypto-shredding** (`src/crypto-shredding/`) — `Kms` interface + `KMS` DI token
  + `MockLocalKms` (**MOCK — replace with real integration**: AES-256-GCM per-user
  data keys held in a local JSON file, not a real KMS/HSM) + `CryptoShreddingService`
  which encrypts everything under `payload.sensitive.*` with the owning user's key
  before the envelope is signed/written, and decrypts it back only on an
  authorized, explicit `revealSensitive=true` read. `DELETE /crypto-keys/:userId`
  (staff/system only) destroys a user's key — the actual right-to-erasure
  operation: every audit entry referencing that key becomes permanently unreadable
  while immudb's tamper-evidence chain (which never sees plaintext or the key
  itself) stays structurally intact. `GET /crypto-keys/:userId/status` reports
  whether a key is still live.
- **Versioned event schema** — already existed in
  `packages/shared-types/src/audit-event.ts` (`AuditEventType`, `AuditEvent`) from
  the scaffold phase, with the full type list from
  `audit-log-architecture-decision.md`. Mirrored into
  `src/audit-events/dto/create-audit-event.dto.ts` as `AUDIT_EVENT_TYPES` because
  `class-validator` needs a concrete runtime list, not just a TS union — **keep the
  two in sync if you add an event type.**
- **Write API + query/verification API** (`src/audit-events/`):
  - `POST /audit-events` — crypto-shred → NASH-sign → `verifiedSet` to immudb →
    index the write in Postgres (`AuditEventIndex`, this service's one Postgres
    table — relational metadata only, per `audit-log-architecture-decision.md`).
    If the immudb write fails, nothing is indexed — a later query simply won't
    find the event, rather than pointing at a write that never happened.
  - `GET /audit-events/:id[?revealSensitive=true]`, `GET
    /audit-events?subjectType=&subjectId=` — reads via the Postgres index (for
    lookup) then `verifiedGet` against immudb (for content + proof).
  - `POST /audit-events/:id/verify` — independently checks two things and only
    reports `valid: true` if both hold: (1) immudb's own inclusion proof —
    `verifiedGet` throws if the stored bytes were altered since the write; (2) the
    NASH signature over the canonical envelope, re-verified against the signer's
    public key. Returns which of the two failed in `details`, not just a bare
    boolean, since "signature invalid" and "immudb proof invalid" are different
    incident types operationally.
  - `BearerAuthGuard` (`src/auth/`) enforces that every route (except `/health`)
    requires a valid Keycloak-issued bearer token — reuses the
    `createTokenVerifier` factory that already existed in `src/common/clients.ts`.
- **`packages/audit-client`** — was already essentially complete from the scaffold
  phase (`AuditClient.record/getEvent/listForSubject/verify`, `AuditClientError`,
  the `AuditOutboxRow` type + Prisma model suggestion in `outbox.ts`). Added tests
  for `getEvent`, `listForSubject`, `verify`, async token providers, and timeout
  behaviour — it now has 7 passing tests instead of 2. No API changes; it already
  matched the shape of the endpoints this service actually implements once built.

## Key decisions

1. **Crypto-shredding ownership**: `packages/shared-types/src/audit-event.ts`'s doc
   comment says a writing service is expected to have already made sensitive
   payload fields crypto-shredding-eligible before they reach this service. In
   practice, crypto-shredding's "erasure" operation (destroying a key) has to live
   wherever the key does — so this service owns the per-user KMS key and
   re-encrypts anything under `payload.sensitive.*` on the way in, rather than
   trusting an unspecified upstream encryption primitive. Convention for callers:
   put crypto-shreddable fields under a `sensitive` object in `payload`; everything
   else in `payload` is written in cleartext. Documented here because it's a
   genuine (small) divergence from that other file's literal wording, not because
   it contradicts the *architecture decision* doc, which explicitly assigns "the
   healthcare-specific layer" (including crypto-shredding) to this service.
2. **Crypto-shredding key ownership resolution** (`resolveCryptoShreddingOwner` in
   `audit-events.service.ts`): prefer the event's `subject` when it's directly a
   `Patient`; else an explicit `payload.patientId` (for events whose subject is a
   Referral/Booking/etc., not a Patient directly); else the acting principal. Every
   clinical event this platform emits has a patient in scope one way or another per
   `modules-and-requirements.md`, so this always resolves to *some* owner — but
   callers should pass `payload.patientId` explicitly whenever the subject isn't
   the Patient itself, rather than relying on the actor fallback.
3. **Postgres index table, not immudb-only**: immudb is a verifiable key/value
   store with no secondary-index query engine. `AuditEventIndex` (Postgres,
   `audit_log` schema) is what lets `GET /audit-events?subjectType=&subjectId=`
   work at all — it's a pointer table (id → immudb key + tx id), never the source
   of truth for content or tamper-evidence, both of which stay in immudb.

## What's mocked (clearly labelled in code, not hidden)

- `src/signing/mock-nash.signer.ts` — local Ed25519 keypair instead of a real
  NASH-issued, HSM-held certificate.
- `src/crypto-shredding/mock-local.kms.ts` — local AES-256-GCM keys in a JSON file
  instead of AWS KMS/CloudHSM.

Both are behind interfaces (`Signer`, `Kms`) with DI tokens (`NASH_SIGNER`, `KMS`)
bound in `signing.module.ts`/`crypto-shredding.module.ts` — swapping in real
implementations is a one-factory-function change, no call site changes.

## Dockerfile fix

Added a `RUN npm run prisma:generate -w services/audit-log` step before the build
step in `services/audit-log/Dockerfile` — it was missing (the original scaffold
Dockerfile went straight from `npm install` to `npm run build`), which would have
made every Docker build of this service fail once real Prisma-backed code existed,
since `tsc` needs the generated `@prisma/client` types. Not exercised end-to-end
here (no Docker daemon in this sandbox — see below), but it's the standard,
minimal fix and mirrors what `npm run prisma:generate -w services/audit-log`
already does for local dev per the README.

## Known gaps / incomplete

- **`prisma generate`/`prisma migrate dev` could not run in this build's sandbox.**
  `binaries.prisma.sh` is blocked by outbound egress policy (confirmed via the
  agent proxy status endpoint as a policy denial — 403 on CONNECT — not a
  transient failure, so not something to route around per the environment's own
  instructions). Consequences and what's done about them:
  - `prisma/migrations/20260813000000_init/migration.sql` is hand-authored to
    match `schema.prisma`'s `AuditEventIndex` model exactly. Verified by applying
    it directly to a real local Postgres instance (`psql`) and confirming the
    resulting table/index shape matches. In a real dev/CI environment, run `npm
    run prisma:generate -w services/audit-log` once network access to
    binaries.prisma.sh is available — this migration will either be recognized as
    already applied or can be regenerated from `schema.prisma` directly.
  - `npm run typecheck -w services/audit-log` currently fails with exactly 4
    errors, all "`Property 'auditEventIndex' does not exist on type
    'PrismaService'`" in `audit-events.service.ts` — the direct consequence of no
    generated Prisma client existing. Every other file in this service
    typechecks clean (verified: removing `src/audit-events/audit-events.service.ts`
    and `src/prisma/prisma.service.ts` from the equation, the rest of the module
    graph has zero errors). This will resolve itself once `prisma generate` runs
    successfully.
  - `services/audit-log/jest.config.js` maps `@prisma/client` to
    `test/stubs/prisma-client.stub.ts` (a two-method no-op stand-in for
    `PrismaClient`) and runs ts-jest in `isolatedModules` (transpile-only) mode —
    **both sandbox-only workarounds**, documented at length in the stub file and
    in `jest.config.js` itself, so unit tests can actually execute instead of
    failing at module-load time. Neither is used by the Dockerfile, `npm run
    build`, or `npm run start` — those resolve the real `@prisma/client` as
    normal. Delete the `moduleNameMapper` entry (and optionally the
    `isolatedModules` transform) once `prisma generate` works in this
    environment.
  - Every unit test that exercises `AuditEventsService` constructs it directly
    with a small hand-rolled fake matching the two Prisma calls it actually
    makes (`create`/`findUnique`/`findMany` on `auditEventIndex`) — see
    `audit-events.service.spec.ts`. The real `PrismaService`/generated client is
    never exercised by these tests; that requires a real Postgres connection
    (works — see "Verified" below) plus a generated client (doesn't, in this
    sandbox).
- **No live immudb integration test.** No Docker daemon is available in this
  sandbox (`docker ps` fails to reach the socket), so `docker compose up -d
  immudb` isn't possible. I downloaded the real `immudb` v1.9.5 Linux binary
  directly from its GitHub release (a host the egress policy does allow) to try a
  genuine end-to-end smoke test of `ImmudbService` against a real immudb server —
  but this sandbox's process management kills any backgrounded/detached process
  within a fraction of a second of the shell command that launched it returning
  (verified: `ps`/`ss` show the process gone within ~1s regardless of `nohup`,
  `disown`, or `setsid`), so a server process can't stay alive long enough for a
  second command to connect to it. I did not find a way around this without a
  real container runtime, and stopped rather than loop on it. **The `ImmudbService`
  code itself was checked line-by-line against `immudb-node`'s actual JS
  implementation** (`node_modules/immudb-node/dist/src/client.js`) rather than
  just its (occasionally inconsistent) `.d.ts` — in particular, confirming
  `verifiedSet`/`verifiedGet` take plain `{ key: string, value: string }` and that
  `Entry.toObject()` base64-encodes the value (handled via `Buffer.from(...,
  'base64')` in `ImmudbService.verifiedGet`). To actually verify this end-to-end:
  `docker compose up -d postgres immudb` then `npm run test:e2e -w
  services/audit-log`, or run the service with `npm run start:dev -w
  services/audit-log` and hit it with the `curl` example in the README.
- **No `AuditOutbox` model added to any other service's Prisma schema.** That's
  correctly out of scope for this service (each service owns its own outbox
  table per `packages/audit-client/src/outbox.ts`'s suggested shape) — noting it
  here so whoever builds the first real clinical write in another service knows
  the pattern (`packages/audit-client`'s README) is ready to use.
- **`docker-compose.yml` is outside this service's scope** (per this build's
  instructions) so it was not edited, but two things there are worth a follow-up
  by whoever owns that file:
  1. `KMS_MOCK_KEYSTORE_PATH` isn't set in the `audit-log` service's
     `environment:` block — it'll fall back to `./local-dev-only-kms-keystore.json`
     (relative to the container's workdir), which works but isn't on a named
     volume, so the mock KMS "erasure" state won't survive a container recreate.
  2. `NASH_SIGNING_KEY_PATH` is set to `/run/secrets/local-dev-only-nash-key.pem`
     — if that path isn't writable in the container (Docker secrets mounts are
     typically read-only), `MockNashSigner`'s first-run key generation will fail
     there. Not verified against the real container (no Docker daemon in this
     sandbox — see above); worth checking when someone next runs the full stack.

## Verified

- `npm run test -w services/audit-log` — **22/22 unit tests pass**, covering:
  canonical JSON determinism; `MockNashSigner` (sign/verify round-trip, tamper
  detection, unknown-key rejection, keypair persistence across instances);
  `MockLocalKms` (encrypt/decrypt round-trip, per-user isolation, crypto-shredding
  makes prior ciphertext permanently unreadable, persistence across instances, key
  reissuance after shredding); `CryptoShreddingService` (payload pass-through when
  no `sensitive` field, protect/reveal round-trip, reveal throws after shredding);
  `AuditEventsService` (record → sign → immudb write → Postgres index, get-by-id
  round-trip, crypto-shredded fields hidden by default and revealed on request,
  subject-scoped listing in order, `verify()` reporting `valid: true` for an
  untampered entry and `valid: false` with the correct failing `details` flag for
  a tampered one).
- `npm run test -w packages/audit-client` — **7/7 tests pass** (2 pre-existing + 5
  added).
- `npx eslint services/audit-log/src services/audit-log/test --max-warnings=0` and
  the same for `packages/audit-client/src` — both clean, zero warnings.
- `npx tsc -p services/audit-log/tsconfig.json --noEmit` — clean except the 4
  Prisma-codegen-dependent errors explained above.
- The hand-authored migration SQL was applied to a real local PostgreSQL 16
  instance (`CREATE SCHEMA audit_log; <migration.sql>`) and the resulting table
  (`audit_log.audit_event_index`, columns + both indexes) was inspected with
  `\d` and matches `schema.prisma` exactly.
- Not run: `npm run test:e2e -w services/audit-log` (boots the real `AppModule`,
  which needs a live immudb — see "Known gaps" above) and any manual `curl`
  against a running instance of the service itself.

## How to run/test this service in isolation

```bash
npm install                                             # from repo root
cp services/audit-log/.env.example services/audit-log/.env
docker compose up -d postgres redis keycloak immudb      # needs a Docker daemon
npm run prisma:generate -w services/audit-log            # needs network access to binaries.prisma.sh
npm run prisma:migrate -w services/audit-log -- --name init   # or apply migration.sql directly
npm run start:dev -w services/audit-log                  # -> http://localhost:3012/health

npm run test -w services/audit-log        # unit tests — no external infra needed
npm run test:e2e -w services/audit-log    # needs the docker-compose infra above
```

See `services/audit-log/README.md` for the full API surface and a `curl` example.
