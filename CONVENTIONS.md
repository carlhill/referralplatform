# CONVENTIONS.md

**Read this before writing any code in this repo.** ~15 agents/contributors build in
this monorepo in parallel after this scaffolding phase; this document is what keeps
their work consistent with each other. It is deliberately prescriptive — where there
was a choice to make, it's already made below. Don't relitigate a convention in your
own corner of the repo; raise it and change this file for everyone, or follow it.

Every decision below traces back to a project doc under `claude/` (read via the
Projects tool against the "Doctor Referral Platform" project, not on disk — see
`README.md`). Where it matters, the doc is named so you can go read the reasoning.

---

## 1. Directory layout

```
referralplatform/
├── services/                    # NestJS/TypeScript microservices (one per bounded concern)
│   ├── audit-log/                #   immudb-backed, NASH-signed audit trail (port 3012)
│   ├── identity-access/          #   auth, passkeys, OIDC, myID relying party (port 3001)
│   ├── onboarding-account/       #   SMS-link → DOB/Medicare → OTP account flow (port 3002)
│   ├── gp-authorisation/         #   new-GP push-approval / GP-link management (port 3003)
│   ├── consent-security/         #   consent page, re-attestation, raise-a-concern (port 3004)
│   ├── referral/                 #   referral lifecycle, urgent flag, activation queue (port 3005)
│   ├── directory/                #   specialist/GP directory, NHSD sync, HealthPathways (port 3006)
│   ├── booking/                  #   calendar sync, slot matching, waitlist (port 3007)
│   ├── specialist-review/        #   AI-assisted extraction, eConsult, pathology requests (port 3008)
│   ├── followup-recall/          #   Follow-up Plans, reminders, deceased suppression (port 3009)
│   ├── notification/              #   push/SMS/email fan-out, secure message threads (port 3010)
│   ├── admin-console/            #   internal staff tooling backend (port 3011)
│   └── fhir-gateway/             #   Java/Spring Boot/HAPI FHIR — the ONE non-NestJS service (port 3013)
├── apps/                         # Frontend surfaces
│   ├── gp-portal/                #   Next.js — GP/practice staff web portal (port 3100)
│   ├── specialist-portal/        #   Next.js — specialist/practice staff web portal (port 3101)
│   ├── patient-web/              #   Next.js — patient/carer companion web app (port 3102)
│   └── patient-mobile/           #   Expo/React Native — primary patient/carer surface
├── packages/                     # Shared libraries, imported by services/apps via npm workspaces
│   ├── shared-types/              #   TS types for every core domain object — see §3
│   ├── ui-components/            #   Design system (Button, Card, StatusBadge, FormField) — see §4
│   ├── audit-client/              #   Client for writing to the Audit Log Service — see §7
│   └── auth-client/               #   Keycloak OIDC token verification client — see §8
├── infra/
│   ├── terraform/                #   network/, database/, ecs/, secrets/ — structure only, not applied
│   ├── keycloak/                 #   realm-export.json imported by the local `keycloak` container
│   └── postgres/                 #   init-schemas.sql — creates each service's Postgres schema
├── .github/workflows/ci.yml      # Lint/typecheck/build/test every workspace on push
├── docker-compose.yml            # Full local stack — see README.md "How to run this locally"
├── CONVENTIONS.md                # This file
├── README.md
└── BUILD_LOG/                    # Per-service build logs — see BUILD_LOG/README.md
```

**Adding a new top-level service?** It goes in `services/`, gets its own npm workspace
(via `services/*` in the root `package.json`), its own Postgres schema, its own port
(next unused number in the 300x/301x range — update this table, `docker-compose.yml`,
and `infra/postgres/init-schemas.sql` together), and its own entry in
`docker-compose.yml`. Don't add a service anywhere else.

---

## 2. Package manager: npm workspaces (not pnpm/yarn)

**Choice: npm workspaces.** Reasoning: npm ships with Node (no extra tool to install
or version-pin across ~15 agents' environments), workspace support has been stable
since npm 7, and this repo's dependency graph doesn't need pnpm's stricter
node_modules isolation or yarn's plug-and-play — the shared-package-imported-by-many-
services case npm workspaces is weakest at (phantom dependencies) hasn't been a
problem building this scaffold. Revisit if the team hits npm's real weaknesses
(slower installs at real scale, less precise hoisting control) — it's not a
one-way door, since `packages/*` already declare exact dependencies rather than
relying on hoisting accidents.

**Rule: one `npm install` at the root installs everything.** Never `cd` into a
service and run `npm install` there — it fragments the lockfile and breaks workspace
linking. Internal packages are referenced with `"@referralplatform/shared-types": "*"`
(not a version range, not `workspace:*` — that's pnpm/yarn syntax npm doesn't support);
npm resolves `*` to the local workspace package automatically.

**Root scripts** (`npm run <script>`) fan out to every workspace via
`--workspaces --if-present`: `build`, `lint`, `test`, `typecheck`, `format`,
`format:check`. Run `npm run build -w services/referral` to target one workspace.

---

## 3. The NestJS service template

**Every service under `services/*` (except `fhir-gateway`) is stamped from the same
template and has the identical file layout.** `services/referral/` is a clean
reference copy — when adding a new service, copy an existing one (not `fhir-gateway`)
and rename, rather than starting from `nest new`:

```
services/<name>/
├── package.json          # name: @referralplatform/<name>-service
├── tsconfig.json          # extends root tsconfig.json
├── tsconfig.build.json     # excludes test files from the compiled build
├── jest.config.js          # unit tests (src/**/*.spec.ts)
├── jest.e2e.config.js      # e2e tests (test/**/*.e2e-spec.ts)
├── Dockerfile              # multi-stage, MONOREPO ROOT build context — see §9
├── .env.example            # see §10
├── README.md
├── prisma/
│   └── schema.prisma       # this service's own Postgres schema — see §5
├── src/
│   ├── main.ts              # NestFactory.create + ValidationPipe + ConfigService port binding
│   ├── app.module.ts        # thin wiring only — ConfigModule + HealthModule (+ your modules)
│   ├── health/
│   │   ├── health.module.ts
│   │   ├── health.controller.ts    # GET /health — unauthenticated, used by docker-compose healthchecks
│   │   └── health.controller.spec.ts
│   └── common/
│       └── clients.ts        # reference wiring for audit-client/auth-client — see §7, §8
└── test/
    └── health.e2e-spec.ts    # boots the real Nest app via supertest
```

**When you add real functionality to a service**, follow the same pattern Nest
encourages: one module per bounded concept inside that service (e.g.
`referral/src/referral/referral.module.ts`, `.controller.ts`, `.service.ts`,
`.spec.ts`), imported into `app.module.ts`. Don't put business logic in
`app.module.ts` or `main.ts`.

**`class-validator` + `class-transformer`** are already dependencies and `main.ts`
already installs a global `ValidationPipe` — define request DTOs as classes with
`class-validator` decorators (`@IsString()`, `@IsUUID()`, etc.) rather than plain
interfaces, so validation is enforced at the framework level, not hand-rolled per
handler.

**The one exception: `services/fhir-gateway`** is Java/Spring Boot/HAPI FHIR, not
NestJS — see `claude/solution-architecture-tech-stack.md` ("Exception — the
FHIR/interoperability layer is Java") for why. It sits behind a clean internal HTTP
API so the rest of the platform never has to know it's a different language. Its
`pom.xml`/Maven structure is documented in its own README, not here.

---

## 4. Shared types: `packages/shared-types`

Every service/app that reads or writes a `Patient`, `Carer`, `GPLink`, `Referral`,
`ComplianceFlag`, `DirectoryEntry`, `Booking`, `FollowUpPlan`, `AuditEvent`,
`ConsentRecord`, or `Concern` imports its shape from `@referralplatform/shared-types`
— **never redeclare one of these shapes locally.** This is what keeps ~15
independently-built services speaking the same data model. IDs are branded string
types (`PatientId`, `ReferralId`, ...) so passing the wrong kind of ID somewhere is a
compile error, not a runtime bug.

Changing a shared type is a cross-cutting change: grep the monorepo for usages before
renaming or removing a field, and prefer additive/optional fields.

---

## 5. Database access: Prisma, one Postgres instance, one schema per service

**ORM choice: Prisma**, standardized across every service that touches Postgres
(every service except `fhir-gateway`, which has no relational store of its own).
Reasoning: strong TypeScript inference (matches the "structured, typed" bar the rest
of the stack holds to), a real migration story (`prisma migrate`), and it's the
option the team is meant to commit to rather than mixing TypeORM in some services and
Prisma in others — see `claude/solution-architecture-tech-stack.md`.

**Database topology: ONE shared PostgreSQL instance, with each service owning its own
Postgres _schema_** (`referral`, `booking`, `identity_access`, ...) — not one database
instance per microservice. This was chosen over per-service instances because at this
build's scale it's materially cheaper to run and back up, while row-level security and
schema-level isolation still give the enforcement boundary the consent model needs
(see `claude/solution-architecture-tech-stack.md` — "Postgres row-level security —
genuinely useful for enforcing the consent model... at the database layer"). Schemas
are created up front by `infra/postgres/init-schemas.sql` (see `docker-compose.yml`'s
`postgres` service) so a service's own Prisma migrations only ever need
`CREATE TABLE`, not `CREATE SCHEMA`, privileges.

**Each service's `DATABASE_URL`** points at the same Postgres host with a distinct
`?schema=<service_schema_name>` query parameter — see that service's `.env.example`.
A service must never read or write another service's schema directly; cross-service
data access goes through that service's API (see §6), never a shared DB connection.

**Migration convention:**

```bash
npm run prisma:migrate -w services/<name> -- --name <what_changed>
```

commits a new file under `services/<name>/prisma/migrations/` — **always commit
migration files**, never rely on `prisma db push` outside local scratch work. Run
`npm run prisma:generate -w services/<name>` after pulling a schema change from
someone else before your build/typecheck will pick up new fields.

**`services/audit-log` is the one partial exception**: its Postgres schema
(`audit_log`) holds only relational metadata (e.g. verification-request
bookkeeping) — the actual tamper-evident audit entries live in immudb, a
structurally different, purpose-built store. See
`claude/audit-log-architecture-decision.md` and that service's `.env.example`
(`IMMUDB_*` variables) for why.

---

## 6. How services call each other: REST + internal client libraries

**Default: plain REST/HTTP over the docker-compose network**, using each service's
`SERVICE_NAME:PORT` as configured in `docker-compose.yml` and each `.env.example`.
Define request/response contracts with OpenAPI (add `@nestjs/swagger` decorators to
controllers as real endpoints are built) — an implicit contract inferred from
whatever the frontend currently sends is not acceptable per
`claude/solution-architecture-tech-stack.md`'s enterprise-grade standards.

**Two cross-cutting concerns get a dedicated TS client library instead of ad hoc
`fetch` calls, because every service needs them and they need to behave identically
everywhere:**

- **Writing to the Audit Log Service** → `packages/audit-client` (see §7). Never
  hand-roll a `fetch('http://audit-log:3012/audit-events', ...)` call.
- **Verifying an incoming request's token, or getting a service-to-service token** →
  `packages/auth-client` (see §8). Never decode a JWT by hand or call Keycloak's
  token endpoint directly from service code.

For everything else (Referral Service asking the Directory Service for a specialist,
the Booking Service asking the Notification Service to send a reminder), call the
target service's REST API directly with a plain `fetch`/`axios` call, authenticated
via a service-to-service token from `packages/auth-client`. Don't build a bespoke
`packages/referral-client` etc. unless/until three or more services need to call the
same one and the duplication is real — most inter-service calls in this system are
one-directional and infrequent enough that a shared client library is premature
abstraction.

**Async/eventing**: reminder scheduling, notification fan-out, and audit-log write
confirmation are async by design (see `claude/solution-architecture-tech-stack.md`,
"Messaging / async") — use a managed queue (SQS/SNS or Azure Service Bus in real
environments), not Kafka. Not yet wired into this scaffold; when you add it, it's
infrastructure a service depends on, not a new packages/ client library.

---

## 7. Using `packages/audit-client`

```ts
import { AuditClient } from '@referralplatform/audit-client';
import { ServiceTokenProvider } from '@referralplatform/auth-client';

const tokens = new ServiceTokenProvider({
  issuer: config.getOrThrow('KEYCLOAK_ISSUER'),
  clientId: config.getOrThrow('KEYCLOAK_CLIENT_ID'),
  clientSecret: config.getOrThrow('KEYCLOAK_CLIENT_SECRET'),
});
const auditClient = new AuditClient({
  baseUrl: config.getOrThrow('AUDIT_LOG_SERVICE_URL'),
  getServiceToken: () => tokens.getToken(),
});

await auditClient.record({
  type: 'referral.created',
  actor: { principalType: 'gp', id: gp.id, healthcareIdentifier: gp.hpiI },
  subject: { type: 'Referral', id: referral.id },
  payload: { urgent: referral.urgent },
});
```

See `services/<name>/src/common/clients.ts` in every service for this exact wiring
already written (not yet called from anywhere — wire it into a real provider once
the service performs its first clinical/consent-relevant write).

**Every write to a clinical or consent-relevant record MUST produce a corresponding
audit entry — this is structural, not optional per-feature** (see
`claude/audit-log-architecture-decision.md`). The required pattern is the **outbox
pattern**, not a direct call inside the request handler:

1. In the same DB transaction as your domain write, insert a row into your service's
   own `AuditOutbox` Prisma model (shape documented in
   `packages/audit-client/src/outbox.ts`).
2. A relay (a `@nestjs/schedule` cron job or a queue consumer) reads unpublished
   outbox rows and calls `auditClient.record()` for each, then marks them published.

A direct `auditClient.record()` call in the request path is acceptable only for
genuinely non-clinical, non-consent events (e.g. a debug/diagnostic event) — if
you're unsure which category something falls into, use the outbox pattern; see the
event type list in `packages/shared-types/src/audit-event.ts` for what counts as
clinical/consent-relevant.

---

## 8. Using `packages/auth-client`

**User-facing auth** (a request arriving from a patient/carer/GP/specialist/staff
member's browser or app):

```ts
import { TokenVerifier, requireAuth } from '@referralplatform/auth-client';

const verifier = new TokenVerifier({
  issuer: process.env.KEYCLOAK_ISSUER!,
  audience: process.env.KEYCLOAK_CLIENT_ID,
});
app.use(requireAuth(verifier)); // populates req.auth: AuthenticatedPrincipal
```

**Service-to-service auth** (this service calling another, or calling
`packages/audit-client`): use `ServiceTokenProvider` (client-credentials grant against
Keycloak) as shown in §7. Every service already has its own confidential Keycloak
client (`<name>-service`, secret `change-me-in-local-env` in local dev) pre-defined in
`infra/keycloak/realm-export.json`.

**Assurance levels are not enforced by this library** — it only verifies whatever
token Keycloak issued. Per `claude/identity-security-recommendations.md` §6:
passkey/hardware-key is _mandatory_ for GP/specialist roles (AAL2/AAL3), passkey is
_encouraged with OTP fallback_ for patients/carers. Enforcing this is a Keycloak
authentication-flow configuration (see `infra/keycloak/README.md`, "What's NOT in here
yet"), checked in application code via `AuthenticatedPrincipal.raw`'s `acr`/`amr`
claims for step-up-gated actions (approving a new GP link, granting deceased-patient
access).

---

## 9. Docker build context

**Every Node service/app's `Dockerfile` expects the MONOREPO ROOT as its build
context**, not its own directory — because it depends on `packages/shared-types` (and
`audit-client`/`auth-client`/`ui-components` as applicable), which only exist relative
to the root. `docker-compose.yml` already sets this up correctly
(`build: { context: ., dockerfile: services/<name>/Dockerfile }`) — if you ever build
an image by hand, build from the repo root:

```bash
docker build -f services/referral/Dockerfile -t referralplatform/referral-service .
```

**`services/fhir-gateway` is the one exception** — it's a self-contained Maven module
with no monorepo dependency, so its build context is its own directory:

```bash
docker build -f services/fhir-gateway/Dockerfile -t referralplatform/fhir-gateway services/fhir-gateway
```

**Docker layer caching — copy `package.json` files before source, not `COPY . .` first.**
Every Node Dockerfile's builder stage must copy only what `npm install` actually needs
before running it — the root `package.json`/`package-lock.json`, plus the `package.json`
of each workspace *this service itself depends on* (matching its own `npm run build -w
...` line) — then `COPY . .` for the rest of the source *after* `npm install` completes:

```dockerfile
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/audit-client/package.json packages/audit-client/package.json
COPY packages/auth-client/package.json packages/auth-client/package.json
COPY services/<this-service>/package.json services/<this-service>/package.json
COPY certs ./certs
RUN npm install -g npm@11 && npm install --workspaces --include-workspace-root
COPY . .
RUN npm run prisma:generate -w services/<this-service>   # if applicable
RUN npm run build -w packages/shared-types -w ... -w services/<this-service>
```

Doing `COPY . .` before `npm install` means Docker's cache treats *any* file changing
*anywhere* in the whole monorepo as "install's inputs changed" — a one-line source edit
in an unrelated service forces the full multi-minute `npm install --workspaces` to rerun,
even though install only actually depends on the `package.json`/lockfile contents. npm's
workspace glob (`services/*`, `apps/*`, `packages/*` in the root `package.json`) resolves
against whatever's present on disk at install time, so copying only some workspaces'
`package.json` files is safe — it won't error on the ones that aren't copied yet.

**Pre-flight checklist — verify every one of these for a service *before* considering
its Docker build done**, not just "it built once." This list exists because every item
on it was a real, previously-undiscovered bug found the hard way across the first pass
of getting this stack to build at all — see `BUILD_LOG/local-build-fixes.md` for the
full story behind each one. Check the service's actual source, don't just assume a
pattern that held for one service holds for another:

1. **Cert trust + npm upgrade** — Dockerfile has `ENV NODE_EXTRA_CA_CERTS=...` and
   `npm install -g npm@11` before the workspace install (works around a TLS-inspecting
   local proxy/antivirus and a known npm 10.8.x crash).
2. **`prisma:generate` Dockerfile step present** — if the service's `package.json` has a
   `prisma:generate` script, the Dockerfile must actually `RUN` it before `npm run
   build`. Six services shipped without this and had a `PrismaClient` with zero
   generated models as a result — compare `package.json` against the Dockerfile, don't
   assume one implies the other.
3. **Prisma pinned to `^6.19.0`**, not a `^7.x` range — this codebase's `schema.prisma`
   files use pre-v7 syntax that Prisma 7 removed.
4. **No `args: unknown` in a hand-rolled Prisma bridge interface** (`TxClient`,
   `<Name>PrismaClient`, `AuditOutboxWriter`, etc.) — must be `args: any`. `unknown`
   can never structurally satisfy Prisma's real generated method signatures.
5. **No self-referential `$transaction` field** in a bridge interface (i.e. its own
   `$transaction`'s callback parameter typed as *itself*) — Prisma's real
   transaction-callback argument type omits `$transaction` entirely (no nested
   transactions), so a self-referencing declaration can never be satisfied. A *two-tier*
   version (`RootPrismaClient extends TxClient`, where `$transaction`'s callback is
   typed as the separate, narrower `TxClient`) is fine and must be kept, not removed.
6. **This service's own `.dockerignore`-relevant footprint** — no service-specific
   exclusions needed beyond the root `.dockerignore`; flag it here if one ever is.
7. **New package.json-first caching pattern** (above) is in place.

If a service uses none of the Prisma-bridge patterns (items 4–5) at all, that's a pass,
not a gap — not every service touches a transaction. Confirm which by grepping the
service's own `src/` rather than assuming.

---

## 10. Environment variable conventions

Every service/app has a **committed `.env.example`** (real values, safe placeholders
for secrets) and a **gitignored `.env`** (never committed — see root `.gitignore`).
Copy one to the other for local dev:

```bash
cp services/referral/.env.example services/referral/.env
```

Conventions every `.env.example` follows:

- `PORT` — the service's fixed port (see the table in §1).
- `DATABASE_URL` — `postgresql://referralplatform:referralplatform@<host>:5432/referralplatform?schema=<service_schema>` (§5).
- `KEYCLOAK_ISSUER` / `KEYCLOAK_CLIENT_ID` / `KEYCLOAK_CLIENT_SECRET` — §8.
- `AUDIT_LOG_SERVICE_URL` — §7 (absent from `audit-log`'s own `.env.example` — see the note in that file).
- `REDIS_URL`.
- Service-specific vars beyond that (e.g. `IMMUDB_*` for `audit-log`, `SMTP_*` for
  `notification`/`onboarding-account`) are documented inline in that service's
  `.env.example` with a comment explaining what they're for.

`docker-compose.yml` sets the same variables directly in each service's `environment:`
block (pointing at other containers by service name, e.g. `postgres`, `keycloak`, not
`localhost`) — `.env.example` is for running a service directly with `npm run
start:dev`, `docker-compose.yml` is for running the whole stack.

**Frontend apps**: Next.js apps use `NEXT_PUBLIC_*` prefixed vars (inlined at build
time — never put a secret behind this prefix); `patient-mobile` uses `EXPO_PUBLIC_*`
for the same reason.

**Never commit a real secret.** Everything in a committed `.env.example` must be a
safe placeholder (`change-me-in-local-env`) or a genuinely public value (a local dev
issuer URL). Real secrets in any real environment come from AWS Secrets Manager /
KMS — see `infra/terraform/secrets/main.tf`.

---

## 11. Testing convention

**Jest**, everywhere, pinned to **`^29.7.0`** across the entire repo — including
`apps/patient-mobile`. This is a deliberate consistency decision made during
scaffolding, not an oversight: `patient-mobile` depends on `jest-expo`, which itself
depends on `@jest/globals ^29.x`; mixing Jest 29 and Jest 30 across one npm-workspace
`node_modules` tree causes real hoisting collisions (a version of `jest-environment-node`
gets hoisted to the root that doesn't match the `jest-runtime` a different workspace
resolves, producing a cryptic `clearMocksOnScope is not a function` failure with no
useful stack trace pointing at the real cause). **Don't bump Jest to 30.x in just one
workspace** — if the whole repo needs to move to Jest 30 later, it needs to move
together, after `jest-expo` supports it.

**Where tests live:**

- **NestJS services**: unit tests as `src/**/*.spec.ts` (colocated with the code they
  test, run via `npm run test -w services/<name>`); e2e tests as
  `test/**/*.e2e-spec.ts` (boot the real Nest app with `@nestjs/testing` + `supertest`,
  run via `npm run test:e2e -w services/<name>`).
- **Next.js apps**: `app/**/*.test.tsx`, component tests via
  `@testing-library/react` + `jest-environment-jsdom`.
- **`patient-mobile`**: `*.test.tsx` at the app root, via `jest-expo`'s preset +
  `@testing-library/react-native` **pinned to `^13.x`, not `14.x`** — 14.x's peer
  dependency switched from `react-test-renderer` to a new `test-renderer` package
  that didn't render correctly against `jest-expo@57`'s own bundled (older)
  `react-test-renderer` when this was verified; use the instance returned by
  `render()` (`const { getByText } = render(<App />)`) rather than the `screen`
  global export, which had the same incompatibility.
- **`packages/*`**: `src/**/*.test.ts(x)`.

**Run everything**: `npm run test --workspaces --if-present` (what CI runs). **Run one
workspace**: `npm run test -w services/referral`.

**Every service ships with at least one passing smoke test both ways** (unit +
e2e) hitting `GET /health` — this is the baseline every new service must clear before
it's considered scaffolded; don't remove it, extend it as real endpoints are added.

**Web/mobile e2e**: Playwright (web — GP/specialist/patient-web portals) and Maestro
(mobile — `patient-mobile`) are the chosen tools per
`claude/solution-architecture-tech-stack.md`, not yet wired into this scaffold — add
`@playwright/test`/a `playwright.config.ts` or the Maestro CLI config when the first
real user flow (not just a skeleton screen) exists to test end-to-end.

---

## 12. Linting and formatting

**ESLint**: one shared flat config at the repo root (`eslint.config.mjs`) — there is
deliberately no per-service `.eslintrc`. Every workspace's `lint` script is
`eslint <its source dir> --max-warnings=0` (services: `src test`; Next apps: `app`;
`patient-mobile`: `.`; packages: `src`). Zero tolerance for warnings is intentional —
fix or explicitly justify-and-suppress, don't let warnings accumulate across ~15
parallel builders.

**Prettier**: `.prettierrc.json` at the root, `.prettierignore` for generated/vendor
paths. `npm run format` to fix, `npm run format:check` to verify (what CI runs). Run
`npm run format` before committing if you're not using an editor integration.

---

## 13. Naming

- npm package names: `@referralplatform/<name>` for `packages/*`, `@referralplatform/<name>-service`
  for `services/*` (except `fhir-gateway`, which has no npm package — it's Maven), plain
  `@referralplatform/<name>` for `apps/*`.
- Directory names: kebab-case, matching the npm package name's `<name>` segment.
- Postgres schema names: `snake_case` version of the service's directory name
  (`gp-authorisation` → `gp_authorisation`).
- Keycloak client IDs: `<service-directory-name>-service` for backend services,
  `<app-directory-name>` for frontends — see `infra/keycloak/realm-export.json`.

---

## 14. What's genuinely still open

Documented so nobody "fixes" these by accident before a real decision is made:

- The carer-vs-patient/OTP custom Keycloak auth flow (`infra/keycloak/README.md`).
- Passkey/WebAuthn policy and step-up auth flows (same file).
- The async messaging layer (SQS/SNS/Service Bus) — not provisioned yet (§6).
- `infra/terraform/*` — structure only, never applied (see each module's `main.tf`).
- `services/fhir-gateway`'s `pom.xml` could not be built/verified in the sandbox this
  scaffold was generated in (Maven Central was not reachable from that sandbox's
  network policy) — confirm `mvn clean verify` succeeds in a normal dev/CI environment.
  `docker-compose.yml` was validated with `docker compose config` but individual
  service images have not been pulled/built end-to-end in that same sandbox (Docker
  Hub was also not reachable there) — confirm `docker compose up` actually boots the
  full stack in a normal environment before relying on it.
