# admin-console-service

Admin/Ops Console (backend) — AHPRA/WWCC manual verification review, deceased-patient access-request review, PHN/practice onboarding, audit-log query access.

See `claude/modules-and-requirements.md` (project doc) for this service's full
functional/non-functional requirements, and root `CONVENTIONS.md` for the
patterns every service follows (this service is stamped from that template —
structure, scripts, and file layout are identical across all 12 services).

## Run locally

```bash
# from the monorepo root (installs every workspace at once):
npm install

cp services/admin-console/.env.example services/admin-console/.env
# then start the local infra this service needs (Postgres, Redis, Keycloak, ...):
docker compose up -d postgres redis keycloak

npm run start:dev -w services/admin-console
# -> http://localhost:3011/health
```

## Build

```bash
npm run build -w services/admin-console
npm run start -w services/admin-console
```

## Test

```bash
npm run test -w services/admin-console       # unit tests (src/**/*.spec.ts)
npm run test:e2e -w services/admin-console   # e2e tests (test/**/*.e2e-spec.ts)
```

## Database

Prisma against this service's own schema (`admin_console`) in the shared Postgres
instance — see `prisma/schema.prisma` and `.env.example`. First migration:

```bash
npm run prisma:migrate -w services/admin-console -- --name init
```

## Docker

Built from the monorepo root context — see `Dockerfile` and root `docker-compose.yml`.
