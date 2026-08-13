# gp-authorisation-service

GP Authorisation Service — the new-GP push-approval flow; links/unlinks GPs to an existing patient account.

See `claude/modules-and-requirements.md` (project doc) for this service's full
functional/non-functional requirements, and root `CONVENTIONS.md` for the
patterns every service follows (this service is stamped from that template —
structure, scripts, and file layout are identical across all 12 services).

## Run locally

```bash
# from the monorepo root (installs every workspace at once):
npm install

cp services/gp-authorisation/.env.example services/gp-authorisation/.env
# then start the local infra this service needs (Postgres, Redis, Keycloak, ...):
docker compose up -d postgres redis keycloak

npm run start:dev -w services/gp-authorisation
# -> http://localhost:3003/health
```

## Build

```bash
npm run build -w services/gp-authorisation
npm run start -w services/gp-authorisation
```

## Test

```bash
npm run test -w services/gp-authorisation       # unit tests (src/**/*.spec.ts)
npm run test:e2e -w services/gp-authorisation   # e2e tests (test/**/*.e2e-spec.ts)
```

## Database

Prisma against this service's own schema (`gp_authorisation`) in the shared Postgres
instance — see `prisma/schema.prisma` and `.env.example`. First migration:

```bash
npm run prisma:migrate -w services/gp-authorisation -- --name init
```

## Docker

Built from the monorepo root context — see `Dockerfile` and root `docker-compose.yml`.
