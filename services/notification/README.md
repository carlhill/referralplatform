# notification-service

Notification Service — push/SMS/email fan-out and the referral-scoped secure message thread. SMS is mocked; OTP/account-activation email is real for local dev.

See `claude/modules-and-requirements.md` (project doc) for this service's full
functional/non-functional requirements, and root `CONVENTIONS.md` for the
patterns every service follows (this service is stamped from that template —
structure, scripts, and file layout are identical across all 12 services).

## Run locally

```bash
# from the monorepo root (installs every workspace at once):
npm install

cp services/notification/.env.example services/notification/.env
# then start the local infra this service needs (Postgres, Redis, Keycloak, ...):
docker compose up -d postgres redis keycloak

npm run start:dev -w services/notification
# -> http://localhost:3010/health
```

## Build

```bash
npm run build -w services/notification
npm run start -w services/notification
```

## Test

```bash
npm run test -w services/notification       # unit tests (src/**/*.spec.ts)
npm run test:e2e -w services/notification   # e2e tests (test/**/*.e2e-spec.ts)
```

## Database

Prisma against this service's own schema (`notification`) in the shared Postgres
instance — see `prisma/schema.prisma` and `.env.example`. First migration:

```bash
npm run prisma:migrate -w services/notification -- --name init
```

## Docker

Built from the monorepo root context — see `Dockerfile` and root `docker-compose.yml`.
