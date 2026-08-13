# ReferralPlatform

ReferralPlatform automates referral management between doctors and patients in
Australia: a GP creates a referral, the patient's account is verified and activated
through an SMS-link/OTP flow (with a carer/delegate path for patients who can't manage
their own account), the referral is routed to a specialist directory, booking is
handled natively against the specialist's calendar, the specialist reviews the
referral with AI-assisted structured extraction, and a Follow-up Plan schedules
recall reminders — with every consent-relevant and clinical action written to an
immutable, NASH-signed audit trail so the patient, their GPs, and (eventually) MyGov
all have one traceable record of what happened. See the project's `claude/` docs
(accessed via the Projects tool against the "Doctor Referral Platform" project, not
committed to this repo) for the full business case, architecture, and requirements —
this README is the "how do I run it" companion to that project knowledge, not a
replacement for it.

## Repo layout

This is an npm-workspaces monorepo:

- **`services/`** — 12 NestJS/TypeScript microservices (identity & access,
  onboarding, GP authorisation, consent & security, referral, directory, booking,
  specialist review, follow-up & recall, notification, admin console, audit log) plus
  **`services/fhir-gateway`**, the one Java/Spring Boot/HAPI FHIR service.
- **`apps/`** — three Next.js web surfaces (`gp-portal`, `specialist-portal`,
  `patient-web`) and one Expo/React Native app (`patient-mobile`, the primary
  patient/carer surface).
- **`packages/`** — shared TypeScript libraries: `shared-types` (core domain object
  types), `ui-components` (the design system), `audit-client` and `auth-client`
  (clients every service uses to talk to the Audit Log Service and Keycloak).
- **`infra/`** — `terraform/` (module structure only, not applied against any real
  cloud account yet), `keycloak/` (local realm import), `postgres/` (schema init).
- **`.github/workflows/ci.yml`** — lints, builds, and tests every workspace on push.
- **`docker-compose.yml`** — the full local stack.

**Read `CONVENTIONS.md` before writing any code here** — it's the single source of
truth for the directory layout, the NestJS service template, the database/ORM
convention, how services call each other, and the testing convention. It's what keeps
many parallel contributors (human or agent) consistent with each other.

## How to run this locally

```bash
# 1. Install every workspace's dependencies (one install, from the root):
npm install

# 2. Bring up the full stack:
docker compose up -d

# 3. Or run one thing at a time against the shared infra:
docker compose up -d postgres redis keycloak mailhog immudb
cp services/referral/.env.example services/referral/.env
npm run start:dev -w services/referral
```

### What serves what, once `docker compose up -d` is running

| Port          | What                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `5432`        | PostgreSQL (one instance, one schema per service)                                                                                               |
| `6379`        | Redis                                                                                                                                           |
| `3322`        | immudb (gRPC) — the audit trail's tamper-evident ledger                                                                                         |
| `8180`        | Keycloak (admin console + OIDC issuer)                                                                                                          |
| `8025`        | MailHog web UI — **read OTP/account-activation emails here** during local dev (no paid SMS provider — see `claude/modules-and-requirements.md`) |
| `3001`–`3012` | The 12 NestJS services (`identity-access` → `admin-console`, in that port order — see `CONVENTIONS.md` §1 for the exact mapping)                |
| `3013`        | `fhir-gateway` (Java/Spring Boot) — `GET /actuator/health`, `GET /fhir/metadata`                                                                |
| `3100`–`3102` | `gp-portal`, `specialist-portal`, `patient-web` (Next.js)                                                                                       |
| `8081`        | `patient-mobile` (Expo Metro bundler)                                                                                                           |

Every backend service exposes `GET /health`. Every port assignment and every
`depends_on` relationship is documented with a comment directly in
`docker-compose.yml` — that file is the source of truth if this table and it ever
disagree.

### Verified vs. not-yet-verified in this scaffold

Every NestJS service, every Next.js app, and `patient-mobile` were built, linted,
type-checked, and had their tests actually run and passed as part of scaffolding this
repo — including booting a couple of services for real and hitting `GET /health` over
HTTP. **Two things could not be verified inside the sandbox this scaffold was built
in**, because its network policy blocked the relevant registries — confirm both in a
normal dev/CI environment before relying on them:

- `services/fhir-gateway` — Maven Central was unreachable, so `mvn clean verify` has
  not actually been run against `pom.xml`.
- `docker-compose.yml` — validated with `docker compose config` (schema-correct), but
  Docker Hub was unreachable, so no image has actually been pulled/built and no
  container has actually been booted from this file yet.

## TODO

This README will be expanded once every service has real functionality (past the
`GET /health` skeleton stage) — API documentation per service, the Keycloak
auth-flow setup for the carer/patient OTP branch, and a proper architecture diagram
belong here once there's something to diagram. See `CONVENTIONS.md` §14 for the
full list of what's deliberately still open.
