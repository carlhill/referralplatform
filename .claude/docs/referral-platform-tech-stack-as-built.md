# ReferralPlatform — tech stack, as actually built

*Prepared 14 August 2026. This documents what's genuinely in the repo — pulled directly from `package.json`/`pom.xml` files, `docker-compose.yml`, and `CONVENTIONS.md` — not the original plan. It faithfully follows the earlier `solution-architecture-tech-stack.md` planning doc (also in `.claude/docs/`); where the two differ, it's called out explicitly rather than left implicit.*

## Architecture style

Microservices monorepo: 12 NestJS/TypeScript services + 1 Java/Spring Boot service, all TypeScript code sharing one npm-workspaces `node_modules` tree, one shared PostgreSQL instance with per-service schema isolation, REST/HTTP between services (no message broker wired in yet), and four separate frontend surfaces (three Next.js web apps, one Expo/React Native mobile app) — all containerised via Docker Compose for local development, targeting AWS ECS Fargate (not Kubernetes) for Phase 1 production, per the original architecture decision.

## Languages & runtimes

| | Version |
|---|---|
| Node.js | ≥ 20.0.0 (pinned in root `package.json` `engines`) |
| npm | ≥ 10.0.0 |
| TypeScript | `^5.6.3` everywhere — deliberately held back from the newer 7.x line; see "Version-pinning decisions" below |
| Java | 21 (`services/fhir-gateway` only) |
| Maven | via `spring-boot-starter-parent` |

## Backend services (12 × NestJS)

Every service shares the same template (see `CONVENTIONS.md` §3): **NestJS 11** (`@nestjs/common`/`core`/`platform-express` `^11.1.0`), **Prisma `^7.9.1`** as the ORM, **class-validator**/**class-transformer** for DTO validation, **RxJS** (NestJS's own dependency), and **Jest `^29.7.0`** for testing. Each owns its own Postgres *schema* (not a separate database instance) on the one shared Postgres container.

| Service | Distinctive dependencies beyond the shared template |
|---|---|
| `identity-access` | `jose` (JWT/JOSE handling for Keycloak token verification) |
| `onboarding-account` | `nodemailer` (real SMTP, via Mailhog in dev — this is where OTP/activation emails actually send) |
| `gp-authorisation` | shared template only |
| `consent-security` | shared template only |
| `referral` | `@nestjs/schedule` (the 2-day activation queue timer) |
| `directory` | shared template only (NHSD/HealthPathways/secure-messaging integrations are all interface + mock, no real HTTP client deps yet) |
| `booking` | shared template only |
| `specialist-review` | shared template only (LLM extraction is an interface + mock/rule-based fallback, no vendor SDK pinned yet — see "What's real vs. mocked" in `README.md`) |
| `followup-recall` | shared template only |
| `notification` | `nodemailer` (email fan-out; SMS/push are mocked behind their own interfaces) |
| `admin-console` | shared template only |
| `audit-log` | `immudb-node` `^1.1.1` — the real client for immudb, the tamper-evident ledger backing the signed audit trail |

## The one non-Node service: `fhir-gateway`

**Java 21 / Spring Boot 3.3.4**, using **HAPI FHIR** (`hapi-fhir-base`, `hapi-fhir-structures-r4`, `hapi-fhir-validation`, `hapi-fhir-validation-resources-r4`) for real FHIR R4 resource handling and AU Core profile validation — this is a genuine, unmodified HAPI FHIR engine, not a stub. Built with `spring-boot-starter-web`, `-actuator` (health/metrics), and `-validation`.

## Frontend applications

| App | Framework | Notable dependencies |
|---|---|---|
| `apps/gp-portal` | **Next.js `^16.3.0`**, React `^19.1.0` | `@referralplatform/ui-components` (shared design system) |
| `apps/specialist-portal` | Next.js `^16.3.0`, React `^19.1.0` | same shared packages |
| `apps/patient-web` | Next.js `^16.3.0`, React `^19.1.0` | same shared packages |
| `apps/patient-mobile` | **Expo `^57.0.12`** / **React Native `0.87.0`** | `expo-auth-session`, `expo-local-authentication` (biometric/passkey-adjacent), `expo-secure-store`, `expo-linking` — the primary patient/carer surface, per the patient-centred design principle carried through this whole project |

All four share `@referralplatform/shared-types` for domain object types; the three Next.js apps additionally share `@referralplatform/ui-components`.

## Shared packages (`packages/`)

- **`shared-types`** — pure TypeScript domain types, zero dependencies, the single source of truth for core domain objects across every service and app.
- **`ui-components`** — the design system, built on **Radix UI** primitives (`@radix-ui/react-label`, `@radix-ui/react-slot`) with **`lucide-react`** for icons, implementing the palette/typography/8px spacing scale from `.claude/docs/ui-design.md`.
- **`audit-client`** — the mandatory client every service uses to write to and query the Audit Log Service (never a hand-rolled `fetch` call — see `CONVENTIONS.md` §7).
- **`auth-client`** — wraps Keycloak OIDC token verification (`jose`) for both user-facing and service-to-service auth (`CONVENTIONS.md` §8).

## Data layer

| Store | Role |
|---|---|
| **PostgreSQL 16** (`postgres:16-alpine`) | One shared instance, one schema per service (`referral`, `booking`, `identity_access`, ...), created up front by `infra/postgres/init-schemas.sql`. Chosen over per-service instances for cost at this scale, while schema-level isolation still enforces the consent-model boundary at the database layer. |
| **immudb `1.9.5`** (`codenotary/immudb`) | The real, purpose-built tamper-evident ledger backing the signed, hash-chained audit trail — a structurally different store from Postgres, not a workaround. `services/audit-log`'s own Postgres schema holds only relational bookkeeping (verification-request metadata); the actual audit entries live here. |
| **Redis 7** (`redis:7-alpine`) | Caching/session support across services. |

**ORM**: Prisma, standardized everywhere it's needed (every service except `fhir-gateway`) — chosen over TypeORM specifically to avoid mixing ORMs across services. Migrations are hand-authored SQL in this build (never machine-generated — see the Prisma caveat below) but follow Prisma's real migration convention (`prisma migrate dev`, committed migration files, never `prisma db push` outside local scratch work).

## Identity & security

- **Keycloak `26.0`** (`quay.io/keycloak/keycloak`) — OIDC issuer, passkey/WebAuthn policy, realm imported automatically from `infra/keycloak/realm-export.json` on first boot.
- **`jose`** — JWT/JOSE library used by both `identity-access` and `packages/auth-client` for token verification.
- **NASH signing** (for the audit log and FHIR gateway) — implemented behind a `MockNashSigner` interface, keyed off a local named Docker volume rather than a mounted secret; swapping in a real NASH-issued certificate is a matter of implementing one interface, not a rearchitecture.
- **Crypto-shredding** for the erasure/right-to-deletion design — implemented as part of the audit-log service's key-management approach, per `.claude/docs/audit-log-architecture-decision.md`.

## Messaging & notifications

- **Email**: real, via **`nodemailer`** against **Mailhog** (`mailhog/mailhog:v1.0.1`) in local dev — this is genuinely real SMTP delivery, not mocked, just pointed at a dev mail-catcher instead of a production provider. This is also standing in for OTP/SMS delivery in this build (no paid SMS account exists yet — see below).
- **SMS**: mocked (`MockSmsProvider`) — a real integration needs a paid gateway (Twilio, MessageMedia, or similar).
- **Push notifications**: mocked (`MockPushProvider`) — needs FCM/APNs credentials or a unified provider (OneSignal, Expo push).

## Infrastructure & orchestration

- **Docker Compose** (v2, the `docker compose` command) — the complete local stack: all 13 backend services, all 4 frontend apps, Postgres, Redis, immudb, Keycloak, Mailhog. 561 lines, every port and `depends_on` relationship documented inline.
- **Kubernetes: deliberately not used.** Checked directly — there are no k8s manifests or Helm charts anywhere in the repo. This isn't an omission; the architecture explicitly chose **AWS ECS Fargate** for Phase 1 (far less operational surface for a small team — no cluster upgrades, no node management), with Kubernetes (EKS) documented as the deliberate upgrade path once genuine multi-team/multi-cluster complexity justifies it. Containers are built K8s-portable regardless, so that migration is an infrastructure change later, not a rewrite.
- **Terraform** (`infra/terraform/`) — four modules (`network`, `database`, `ecs`, `secrets`) with real `main.tf` files documenting each module's intended AWS resources and exposing placeholder outputs so modules can reference each other. **Nothing here has been applied against any real AWS account** — this is the shape of the infrastructure as code, not a deployed one yet. Target region: `ap-southeast-2` (Sydney), with Melbourne as documented DR, per the AU-data-residency requirement.
- **Async messaging**: the plan (both in the original architecture doc and `CONVENTIONS.md`) is a managed cloud queue — **AWS SQS/SNS**, deliberately not Kafka, since event-streaming-at-scale isn't a problem this platform has yet and running a Kafka cluster is overhead a small team doesn't need. **Not yet wired into this build** — reminder scheduling, notification fan-out, and audit-log write confirmation are structured to be async but currently call synchronously; adding the queue is infrastructure the services will depend on, not a new package.

## Testing & quality tooling

- **Jest `^29.7.0`**, pinned identically across the *entire* repo, including `patient-mobile` — deliberately, not by oversight. `jest-expo` depends on `@jest/globals ^29.x`, and mixing Jest 29/30 in one npm-workspace tree causes real hoisting collisions. Don't bump any single workspace to Jest 30 without moving the whole repo together.
- **NestJS services**: unit tests colocated as `src/**/*.spec.ts`; e2e tests as `test/**/*.e2e-spec.ts` using `@nestjs/testing` + `supertest` against a real booted Nest app.
- **Next.js apps**: `@testing-library/react` + `jest-environment-jsdom`.
- **`patient-mobile`**: `jest-expo`'s preset + `@testing-library/react-native` pinned to `^13.x` (not `14.x` — its peer dependency switch to a new `test-renderer` package didn't render correctly against `jest-expo@57`'s bundled older `react-test-renderer` when verified here).
- **Every service ships at least one passing smoke test both ways (unit + e2e) hitting `GET /health`** — the baseline bar every service had to clear.
- **End-to-end (web)**: **Playwright `^1.48.0`** (`e2e/`), covering the full golden path across `gp-portal` → `specialist-portal` → `patient-web`. Written and structurally validated; never executed against a live stack (see `HANDOFF.md`).
- **End-to-end (mobile)**: **Maestro** is the chosen tool per the architecture doc, not yet wired into the build — add it once a real user flow (not just a skeleton screen) exists in `patient-mobile` to test.
- **Linting/formatting**: **ESLint 10** (flat config, `eslint.config.mjs`) + **`typescript-eslint` `^8.67.0`** + **Prettier `^3.3.3`**, run via root `npm run lint` / `npm run format`.

## CI/CD

**GitHub Actions** (`.github/workflows/ci.yml`) — lints, typechecks, builds, and tests every Node workspace in one job (single root `npm install`, since npm workspaces hoist into one `node_modules` tree), plus a separate job for `fhir-gateway`'s Maven build. Written as a complete, real workflow — not a placeholder — but **has never actually run against a live GitHub repository yet**, since this repo has no remote (see the earlier question about this in this conversation). It should run as-is once pushed.

## Monorepo tooling

**npm workspaces** (not pnpm or Yarn) — `services/*`, `apps/*`, `packages/*` all hoisted into one root `node_modules`. One `npm install` from the repo root installs everything; never `cd` into a service and install locally.

## Version-pinning decisions worth knowing about

A few pins in this repo are deliberate, documented engineering decisions, not defaults — worth not "fixing" without reading the reasoning first:

- **TypeScript held at `^5.6.3`**, not the newer 7.x line — `ts-jest` (used everywhere) doesn't yet support TS 7.
- **Jest held at `^29.7.0`** repo-wide — see above.
- **`@testing-library/react-native` held at `^13.x`** in `patient-mobile` — see above.

## What's real vs. mocked, and what's still needed

Both already fully documented in the repo itself — not repeated here to avoid drift between two copies of the same table: see `README.md`'s **"What's real vs. mocked"** section (13 external integrations, each behind a clean interface with a `Mock*` implementation) and its **"Still needed from you"** section (the non-engineering checklist: business entity, HI Service/NASH registration, secure messaging vendor agreement, insurance, and the rest).

## Where this document sits relative to the others

This is the **as-built** record, grounded directly in the repo. `.claude/docs/solution-architecture-tech-stack.md` is the **as-planned** architecture doc that preceded the build — read together, they show the build faithfully followed the plan (ECS Fargate over Kubernetes, SQS/SNS over Kafka, AWS `ap-southeast-2`, Prisma-only ORM), with the one honest gap being that the async queue itself isn't wired into the scaffold yet, which was already flagged as expected scaffolding-stage behaviour in `CONVENTIONS.md`.
