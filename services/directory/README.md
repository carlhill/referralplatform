# directory-service

Directory Service — the specialist/GP directory: NHSD sync, self-registered profiles, HealthPathways Pathway Link API integration.

See `claude/modules-and-requirements.md` (project doc) for this service's full
functional/non-functional requirements, and root `CONVENTIONS.md` for the
patterns every service follows (this service is stamped from that template —
structure, scripts, and file layout are identical across all 12 services).

## Run locally

```bash
# from the monorepo root (installs every workspace at once):
npm install

cp services/directory/.env.example services/directory/.env
# then start the local infra this service needs (Postgres, Redis, Keycloak, ...):
docker compose up -d postgres redis keycloak

npm run start:dev -w services/directory
# -> http://localhost:3006/health
```

## Build

```bash
npm run build -w services/directory
npm run start -w services/directory
```

## Test

```bash
npm run test -w services/directory       # unit tests (src/**/*.spec.ts)
npm run test:e2e -w services/directory   # e2e tests (test/**/*.e2e-spec.ts)
```

## Database

Prisma against this service's own schema (`directory`) in the shared Postgres
instance — see `prisma/schema.prisma` and `.env.example`. First migration:

```bash
npm run prisma:migrate -w services/directory -- --name init
```

## Docker

Built from the monorepo root context — see `Dockerfile` and root `docker-compose.yml`.
