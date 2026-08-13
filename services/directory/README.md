# directory-service

Directory Service **and** Secure Messaging Gateway — the specialist/GP
directory (NHSD sync, self-registered profiles, HealthPathways Pathway Link
API integration) plus the gateway that routes a referral to a specialist via
secure messaging or direct platform delivery. Both modules (7 and 8 of
`modules-and-requirements.md`) are stamped into this one service workspace —
see `BUILD_LOG/directory.md` for why.

See `claude/modules-and-requirements.md` (project doc) for this service's full
functional/non-functional requirements, and root `CONVENTIONS.md` for the
patterns every service follows (this service is stamped from that template —
structure, scripts, and file layout are identical across all services).

## API

### Directory Service

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/directory/entries` | none | Search the directory (`q`, `subspecialty`, `state`, `acceptsBookingsViaPlatform`, `econsultOptIn`, `limit`, `offset`) |
| GET | `/directory/entries/:id` | none | Fetch one entry |
| PUT | `/directory/entries/self` | bearer | Self-registered profile create/update — supersedes NHSD sync for the same `hpiI` |
| GET | `/directory/pathway-suggestion` | none | HealthPathways Pathway Link suggestion for a free-text `referralReason` (+ optional `phnRegion`), with matching directory entries |
| POST | `/directory/sync/trigger` | bearer | Manually trigger an NHSD sync run (also runs daily at 02:00 via cron) |

### Secure Messaging Gateway

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/secure-messaging/route` | bearer | Route a referral to a specialist (direct delivery or a secure messaging vendor) |
| POST | `/secure-messaging/attempts/:id/retry` | bearer | Retry a failed routing attempt |
| GET | `/secure-messaging/attempts/:id` | bearer | Fetch one routing attempt |
| GET | `/secure-messaging/attempts?referralId=` | bearer | List all routing attempts for a referral |

`GET /health` is unauthenticated (docker-compose healthchecks / CI smoke test).

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
