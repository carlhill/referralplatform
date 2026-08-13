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
# then start the local infra this service needs (Postgres, Redis, Keycloak, ...):
docker compose up -d postgres redis keycloak

npm run start:dev -w services/audit-log
# -> http://localhost:3012/health
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
instance — see `prisma/schema.prisma` and `.env.example`. First migration:

```bash
npm run prisma:migrate -w services/audit-log -- --name init
```

## Docker

Built from the monorepo root context — see `Dockerfile` and root `docker-compose.yml`.
