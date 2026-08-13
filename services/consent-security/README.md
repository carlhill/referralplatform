# consent-security-service

Consent & Security Service — the consent page, linked-GP management, carer re-attestation, raise-a-concern triage, deceased-patient flag/freeze workflow.

See `claude/modules-and-requirements.md` (project doc) for this service's full
functional/non-functional requirements, and root `CONVENTIONS.md` for the
patterns every service follows (this service is stamped from that template —
structure, scripts, and file layout are identical across all 12 services).

## Run locally

```bash
# from the monorepo root (installs every workspace at once):
npm install

cp services/consent-security/.env.example services/consent-security/.env
# then start the local infra this service needs (Postgres, Redis, Keycloak, ...):
docker compose up -d postgres redis keycloak

npm run start:dev -w services/consent-security
# -> http://localhost:3004/health
```

## Build

```bash
npm run build -w services/consent-security
npm run start -w services/consent-security
```

## Test

```bash
npm run test -w services/consent-security       # unit tests (src/**/*.spec.ts)
npm run test:e2e -w services/consent-security   # e2e tests (test/**/*.e2e-spec.ts)
```

## Database

Prisma against this service's own schema (`consent_security`) in the shared Postgres
instance — see `prisma/schema.prisma` and `.env.example`. First migration:

```bash
npm run prisma:migrate -w services/consent-security -- --name init
```

## Docker

Built from the monorepo root context — see `Dockerfile` and root `docker-compose.yml`.
