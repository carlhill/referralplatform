# referral-service

Referral Service — referral creation, urgent fast-path, the 2-day activation queue, and end-to-end referral state management.

See `claude/modules-and-requirements.md` (project doc) for this service's full
functional/non-functional requirements, and root `CONVENTIONS.md` for the
patterns every service follows (this service is stamped from that template —
structure, scripts, and file layout are identical across all 12 services).

## Run locally

```bash
# from the monorepo root (installs every workspace at once):
npm install

cp services/referral/.env.example services/referral/.env
# then start the local infra this service needs (Postgres, Redis, Keycloak, ...):
docker compose up -d postgres redis keycloak

npm run start:dev -w services/referral
# -> http://localhost:3005/health
```

## Build

```bash
npm run build -w services/referral
npm run start -w services/referral
```

## Test

```bash
npm run test -w services/referral       # unit tests (src/**/*.spec.ts)
npm run test:e2e -w services/referral   # e2e tests (test/**/*.e2e-spec.ts)
```

## Database

Prisma against this service's own schema (`referral`) in the shared Postgres
instance — see `prisma/schema.prisma` and `.env.example`. First migration:

```bash
npm run prisma:migrate -w services/referral -- --name init
```

## Docker

Built from the monorepo root context — see `Dockerfile` and root `docker-compose.yml`.
