# gp-authorisation-service

GP Authorisation Service — the new-GP push-approval flow; links/unlinks GPs to an existing patient account.

See `claude/modules-and-requirements.md` (project doc) for this service's full
functional/non-functional requirements, and root `CONVENTIONS.md` for the
patterns every service follows (this service is stamped from that template —
structure, scripts, and file layout are identical across all 12 services).

See `BUILD_LOG/gp-authorisation.md` for the full build write-up (design
decisions, what's mocked, known gaps).

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/gp-links` | `HpioNashAuthGuard` (MOCK HPI-O/NASH — see `src/common/mock-nash-auth.ts`) | A practice system requests a link between a GP and an existing patient account. Auto-approves immediately if `urgentEscalation: true` (with a required `urgentJustification`). |
| `GET` | `/gp-links?patientId=\|gpId=&status=` | Bearer | List GP links for a patient (consent-page "linked GPs" list) or for a GP. |
| `GET` | `/gp-links/authorisation?patientId=&gpId=` | Bearer | **The enforcement point.** Returns `{ authorised, status, linkId? }` — the Referral Service calls this before creating a referral for a GP not already known to be linked. |
| `GET` | `/gp-links/:id` | Bearer | Fetch one link. |
| `POST` | `/gp-links/:id/approve` | Bearer + step-up (`STEP_UP_ACR`) | Patient/carer approves a pending link. |
| `POST` | `/gp-links/:id/decline` | Bearer | Patient/carer declines a pending link. |
| `POST` | `/gp-links/:id/revoke` | Bearer | Patient/carer revokes a currently-approved link — the consent page's "revoke" control. |

A background sweep (`GpLinkExpiryScheduler`, every 5 minutes) and a lazy
check on every read both expire a pending link once its 2-day approval
window passes with no patient response.

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
