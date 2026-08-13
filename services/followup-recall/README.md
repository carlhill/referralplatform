# followup-recall-service

Follow-up & Recall Service — Follow-up Plan management, multi-channel reminder scheduling, test-completion detection, deceased-patient reminder suppression.

See `claude/modules-and-requirements.md` (project doc) for this service's full
functional/non-functional requirements, and root `CONVENTIONS.md` for the
patterns every service follows (this service is stamped from that template —
structure, scripts, and file layout are identical across all 12 services).

See `BUILD_LOG/followup-recall.md` for the full build write-up (design
decisions, what's mocked/interim, known gaps).

## API

All routes require a bearer token (`BearerAuthGuard`) unless noted.

| Module | Method | Path | Notes |
|---|---|---|---|
| Follow-up Plans | `POST` | `/follow-up-plans` | Specialist (or staff on their behalf) only. Schedules the initial reminder cadence. |
| | `GET` | `/follow-up-plans/:id` | |
| | `GET` | `/follow-up-plans?patientId=&status=` | |
| | `POST` | `/follow-up-plans/:id/self-report` | Patient/carer/GP fallback — `{ reportedBy, note? }`. |
| | `POST` | `/follow-up-plans/:id/test-result` | System/staff only — automatic-detection hit, or a real pathology/MHR push integration's target. |
| Health | `GET` | `/health` | Unauthenticated. |

Nothing else is exposed over HTTP — reminder dispatch, escalation, automatic
test-completion detection, and deceased-patient suppression are all internal
`@nestjs/schedule` jobs (see `src/reminders`, `src/test-completion`,
`src/deceased-suppression`), not endpoints.

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
