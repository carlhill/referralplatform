# identity-access-service

Identity & Access Service — authenticates every user type, issues/validates passkeys and OIDC tokens, hosts the myID relying-party integration. Built on Keycloak.

See `claude/modules-and-requirements.md` (project doc) for this service's full
functional/non-functional requirements, and root `CONVENTIONS.md` for the
patterns every service follows (this service is stamped from that template —
structure, scripts, and file layout are identical across all 12 services).

See `BUILD_LOG/identity-access.md` for what's built, key decisions, mocked
pieces, and known gaps.

## What this service owns

Passkey/OIDC login itself happens against Keycloak (`infra/keycloak/realm-export.json`
— WebAuthn policy + the `clinician-browser`/`patient-carer-browser` custom
authentication flows). This service exposes:

- `GET /passkeys`, `DELETE /passkeys/:credentialId` (step-up gated),
  `POST /passkeys/require-reenrolment` — manage a caller's own WebAuthn
  credentials via Keycloak's Admin API (`src/passkeys`, `src/keycloak-admin`).
- `POST /account/social-links/:provider/link-url`, `GET /account/social-links`,
  `DELETE /account/social-links/:provider` — the only place a Google/Microsoft
  secondary sign-in link can be initiated; every route requires an
  already-authenticated caller (`src/account-links`).
- `GET/POST /mock-myid/*` — **MOCK, replace with real integration**: an
  in-process OIDC identity provider standing in for myID (TDIF), which
  Keycloak's `myid` broker points at in local dev (`src/mock-myid`).

All routes except `/health` and `/mock-myid/*` require a verified bearer
token (`requireAuth` middleware from `packages/auth-client`, wired in
`app.module.ts`).

## Run locally

```bash
# from the monorepo root (installs every workspace at once):
npm install

cp services/identity-access/.env.example services/identity-access/.env
# then start the local infra this service needs (Postgres, Redis, Keycloak, ...):
docker compose up -d postgres redis keycloak

npm run start:dev -w services/identity-access
# -> http://localhost:3001/health
```

## Build

```bash
npm run build -w services/identity-access
npm run start -w services/identity-access
```

## Test

```bash
npm run test -w services/identity-access       # unit tests (src/**/*.spec.ts)
npm run test:e2e -w services/identity-access   # e2e tests (test/**/*.e2e-spec.ts)
```

## Database

Prisma against this service's own schema (`identity_access`) in the shared Postgres
instance — see `prisma/schema.prisma` and `.env.example`. First migration:

```bash
npm run prisma:migrate -w services/identity-access -- --name init
```

## Docker

Built from the monorepo root context — see `Dockerfile` and root `docker-compose.yml`.
