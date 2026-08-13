# specialist-review-service

Specialist Review Service — AI-assisted structured extraction for specialists, eConsult-style async advice, pre-visit pathology/imaging requests.

See `claude/modules-and-requirements.md` (project doc) for this service's full
functional/non-functional requirements, and root `CONVENTIONS.md` for the
patterns every service follows (this service is stamped from that template —
structure, scripts, and file layout are identical across all 12 services).

## Run locally

```bash
# from the monorepo root (installs every workspace at once):
npm install

cp services/specialist-review/.env.example services/specialist-review/.env
# then start the local infra this service needs (Postgres, Redis, Keycloak, ...):
docker compose up -d postgres redis keycloak

npm run start:dev -w services/specialist-review
# -> http://localhost:3008/health
```

## Build

```bash
npm run build -w services/specialist-review
npm run start -w services/specialist-review
```

## Test

```bash
npm run test -w services/specialist-review       # unit tests (src/**/*.spec.ts)
npm run test:e2e -w services/specialist-review   # e2e tests (test/**/*.e2e-spec.ts)
```

## Database

Prisma against this service's own schema (`specialist_review`) in the shared Postgres
instance — see `prisma/schema.prisma` and `.env.example`. First migration:

```bash
npm run prisma:migrate -w services/specialist-review -- --name init
```

## Docker

Built from the monorepo root context — see `Dockerfile` and root `docker-compose.yml`.
