# booking-service

Booking Service — calendar free/busy sync, preference capture and matching, waitlist management, urgent fast-path, cancellation/dual-notification.

See `claude/modules-and-requirements.md` (project doc) for this service's full
functional/non-functional requirements, and root `CONVENTIONS.md` for the
patterns every service follows (this service is stamped from that template —
structure, scripts, and file layout are identical across all 12 services).

## Run locally

```bash
# from the monorepo root (installs every workspace at once):
npm install

cp services/booking/.env.example services/booking/.env
# then start the local infra this service needs (Postgres, Redis, Keycloak, ...):
docker compose up -d postgres redis keycloak

npm run start:dev -w services/booking
# -> http://localhost:3007/health
```

## Build

```bash
npm run build -w services/booking
npm run start -w services/booking
```

## Test

```bash
npm run test -w services/booking       # unit tests (src/**/*.spec.ts)
npm run test:e2e -w services/booking   # e2e tests (test/**/*.e2e-spec.ts)
```

## Database

Prisma against this service's own schema (`booking`) in the shared Postgres
instance — see `prisma/schema.prisma` and `.env.example`. First migration:

```bash
npm run prisma:migrate -w services/booking -- --name init
```

## Docker

Built from the monorepo root context — see `Dockerfile` and root `docker-compose.yml`.
