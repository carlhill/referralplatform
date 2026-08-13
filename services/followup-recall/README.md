# followup-recall-service

Follow-up & Recall Service — Follow-up Plan management, multi-channel reminder scheduling, test-completion detection, deceased-patient reminder suppression.

See `claude/modules-and-requirements.md` (project doc) for this service's full
functional/non-functional requirements, and root `CONVENTIONS.md` for the
patterns every service follows (this service is stamped from that template —
structure, scripts, and file layout are identical across all 12 services).

## Run locally

```bash
# from the monorepo root (installs every workspace at once):
npm install

cp services/followup-recall/.env.example services/followup-recall/.env
# then start the local infra this service needs (Postgres, Redis, Keycloak, ...):
docker compose up -d postgres redis keycloak

npm run start:dev -w services/followup-recall
# -> http://localhost:3009/health
```

## Build

```bash
npm run build -w services/followup-recall
npm run start -w services/followup-recall
```

## Test

```bash
npm run test -w services/followup-recall       # unit tests (src/**/*.spec.ts)
npm run test:e2e -w services/followup-recall   # e2e tests (test/**/*.e2e-spec.ts)
```

## Database

Prisma against this service's own schema (`followup_recall`) in the shared Postgres
instance — see `prisma/schema.prisma` and `.env.example`. First migration:

```bash
npm run prisma:migrate -w services/followup-recall -- --name init
```

## Docker

Built from the monorepo root context — see `Dockerfile` and root `docker-compose.yml`.
