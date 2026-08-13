# onboarding-account-service

Onboarding & Account Service — SMS-link to DOB/Medicare verification to patient-vs-carer branch to OTP activation flow; owns the patient/carer/delegate account model.

See `claude/modules-and-requirements.md` (project doc) for this service's full
functional/non-functional requirements, and root `CONVENTIONS.md` for the
patterns every service follows (this service is stamped from that template —
structure, scripts, and file layout are identical across all 12 services).

## Run locally

```bash
# from the monorepo root (installs every workspace at once):
npm install

cp services/onboarding-account/.env.example services/onboarding-account/.env
# then start the local infra this service needs (Postgres, Redis, Keycloak, ...):
docker compose up -d postgres redis keycloak

npm run start:dev -w services/onboarding-account
# -> http://localhost:3002/health
```

## Build

```bash
npm run build -w services/onboarding-account
npm run start -w services/onboarding-account
```

## Test

```bash
npm run test -w services/onboarding-account       # unit tests (src/**/*.spec.ts)
npm run test:e2e -w services/onboarding-account   # e2e tests (test/**/*.e2e-spec.ts)
```

## Database

Prisma against this service's own schema (`onboarding_account`) in the shared Postgres
instance — see `prisma/schema.prisma` and `.env.example`. First migration:

```bash
npm run prisma:migrate -w services/onboarding-account -- --name init
```

## Docker

Built from the monorepo root context — see `Dockerfile` and root `docker-compose.yml`.
