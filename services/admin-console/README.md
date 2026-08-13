# admin-console-service

Admin/Ops Console (backend) — AHPRA/WWCC manual verification review, deceased-patient access-request review, PHN/practice onboarding, audit-log query access.

See `claude/modules-and-requirements.md` (project doc) for this service's full
functional/non-functional requirements, and root `CONVENTIONS.md` for the
patterns every service follows (this service is stamped from that template —
structure, scripts, and file layout are identical across all 12 services).

See `BUILD_LOG/admin-console.md` for the full build write-up (design
decisions, what's mocked/interim, known gaps).

## API

Every route requires a bearer token (`BearerAuthGuard`) **and** an
`internal_staff` principal (`requireStaff`) — this entire service is
internal-staff-only tooling, per `ui-design.md`'s "Admin/Ops Console
(internal staff)" screen inventory.

| Module | Method | Path | Notes |
|---|---|---|---|
| AHPRA/WWCC verification queue | `POST` | `/verification-cases` | Opens a case; best-effort snapshots automated status immediately. |
| | `GET` | `/verification-cases?status=&caseType=` | |
| | `GET` | `/verification-cases/:id` | |
| | `POST` | `/verification-cases/:id/refresh` | Re-pulls automated status from onboarding-account; never decides the case. |
| | `POST` | `/verification-cases/:id/assign` | |
| | `POST` | `/verification-cases/:id/needs-info` | |
| | `POST` | `/verification-cases/:id/approve` | Step-up (`STEP_UP_ACR`) required. |
| | `POST` | `/verification-cases/:id/reject` | Step-up (`STEP_UP_ACR`) required. |
| PHN/practice onboarding pipeline | `POST` | `/practice-onboarding-cases` | Opens a pre-registration lead. |
| | `GET` | `/practice-onboarding-cases?stage=` | |
| | `GET` | `/practice-onboarding-cases/:id` | |
| | `POST` | `/practice-onboarding-cases/:id/refresh` | Pulls HPI-O/compliance-checklist status once linked to a real `GpPractice`. |
| | `POST` | `/practice-onboarding-cases/:id/advance-stage` | Rejects a transition outside `pipeline-stage.ts`'s allowed graph. |
| | `POST` | `/practice-onboarding-cases/:id/assign` | |
| Deceased-patient access requests (proxies consent-security) | `GET` | `/deceased-access-requests/pending` | |
| | `GET` | `/deceased-access-requests/by-patient/:patientId` | |
| | `GET` | `/deceased-access-requests/:id` | |
| | `POST` | `/deceased-access-requests/:id/approve` | Step-up (`STEP_UP_ACR`) required at this console's edge **and** enforced again by consent-security itself. |
| | `POST` | `/deceased-access-requests/:id/deny` | |
| Audit-log query tool (proxies the Audit Log Service) | `GET` | `/audit-log-query/by-subject?subjectType=&subjectId=` | |
| | `GET` | `/audit-log-query/:id` | |
| | `POST` | `/audit-log-query/:id/verify` | Independently re-verifies the immudb proof + NASH signature — never trusts a cached "valid" flag. |

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
