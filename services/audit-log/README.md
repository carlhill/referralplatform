# audit-log-service

Audit Log Service — immudb-backed, NASH-signed tamper-evident audit trail, plus its query/verification API.

See `claude/modules-and-requirements.md` (project doc) for this service's full
functional/non-functional requirements, and root `CONVENTIONS.md` for the
patterns every service follows (this service is stamped from that template —
structure, scripts, and file layout are identical across all 12 services).

## Run locally

```bash
# from the monorepo root (installs every workspace at once):
npm install

cp services/audit-log/.env.example services/audit-log/.env
# this service also needs immudb (not just postgres/redis/keycloak):
docker compose up -d postgres redis keycloak immudb

npm run prisma:generate -w services/audit-log
npm run prisma:migrate -w services/audit-log -- --name init   # first run only — see "Database" below

npm run start:dev -w services/audit-log
# -> http://localhost:3012/health
```

## API

All routes except `/health` require `Authorization: Bearer <token>` (a Keycloak
service-to-service or user token — see `src/auth/bearer-auth.guard.ts`).

- `POST /audit-events` — write a new signed, tamper-evident entry. Body matches
  `CreateAuditEventDto` (`type`, `actor`, `subject`, `payload`, optional
  `occurredAt`). Put anything that shouldn't be stored in cleartext under
  `payload.sensitive` — see `src/crypto-shredding/crypto-shredding.service.ts`.
  Normally called via `packages/audit-client`, not directly.
- `GET /audit-events/:id[?revealSensitive=true]` — fetch one entry.
  `revealSensitive=true` decrypts `payload.sensitive.*` and requires an
  `internal_staff` role or a `system` (service-to-service) principal.
- `GET /audit-events?subjectType=Referral&subjectId=...` — every entry for a
  domain subject, oldest first.
- `POST /audit-events/:id/verify` — independently re-checks the entry's immudb
  inclusion proof AND its NASH signature; returns `{ valid, details: {
  immudbProofValid, nashSignatureValid } }`.
- `GET /crypto-keys/:userId/status` — whether a user's crypto-shredding key is
  still live.
- `DELETE /crypto-keys/:userId` — **irreversibly** crypto-shreds a user's key
  (the right-to-erasure trigger). Staff/system only.

Example, once the service and its infra are running (get a token via
Keycloak's client-credentials grant for `audit-log-service` or another
service's confidential client first):

```bash
curl -X POST http://localhost:3012/audit-events \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "type": "referral.created",
    "actor": { "principalType": "gp", "id": "gp_1", "healthcareIdentifier": "8003-6100-0000-0001" },
    "subject": { "type": "Referral", "id": "ref_1" },
    "payload": { "urgent": true, "sensitive": { "clinicalNote": "chest pain, urgent cardiology referral" } }
  }'
```

## Build

```bash
npm run build -w services/audit-log
npm run start -w services/audit-log
```

## Test

```bash
npm run test -w services/audit-log       # unit tests (src/**/*.spec.ts)
npm run test:e2e -w services/audit-log   # e2e tests (test/**/*.e2e-spec.ts)
```

## Database

Prisma against this service's own schema (`audit_log`) in the shared Postgres
instance — see `prisma/schema.prisma` and `.env.example`. Unlike the other
services here, Postgres holds only a query index (`AuditEventIndex`) pointing
at immudb — the audit entries themselves live in immudb, never in Postgres.
First migration:

```bash
npm run prisma:migrate -w services/audit-log -- --name init
```

`prisma/migrations/20260813000000_init/migration.sql` is already checked in,
hand-authored to match `schema.prisma` — see BUILD_LOG/audit-log.md for why
(`prisma generate`/`migrate dev` couldn't reach binaries.prisma.sh in this
build's sandbox). Run `npm run prisma:generate -w services/audit-log` in a
normal dev/CI environment before building or running this service — it needs
the generated `@prisma/client` types for `AuditEventIndex`.

## Docker

Built from the monorepo root context — see `Dockerfile` and root `docker-compose.yml`.
