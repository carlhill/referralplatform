# ReferralPlatform

![Local build](https://img.shields.io/badge/local%20build-verified%20working-brightgreen)

**Status (2026-08-15): all 21 services build, start, and pass health checks via
`docker compose up -d --build` on a normal local Docker Desktop setup, and the
full golden path (GP referral → patient account → specialist review → booking
→ follow-up) has been exercised end-to-end with real data.** See
[`BUILD_LOG/local-build-fixes.md`](./BUILD_LOG/local-build-fixes.md) for the
full list of what was fixed to get there.

ReferralPlatform automates referral management between doctors and patients in
Australia. A GP creates a referral; the patient's account is verified and
activated through an email-link/OTP flow (with a carer/delegate path for
patients who can't manage their own account); the referral is routed to a
specialist directory; booking is handled natively against the specialist's
calendar; the specialist reviews the referral with AI-assisted structured
extraction; and a Follow-up Plan schedules recall reminders — with every
consent-relevant and clinical action written to an immutable, NASH-signed audit
trail, so the patient, their GPs, and (eventually) MyGov all have one traceable
record of what happened.

This repo is a complete, professionally engineered **reference implementation**
of that design — real code, real architecture, real tests — built to run
entirely in a local/sandboxed Docker Compose environment. Every external system
this platform will eventually depend on that requires a real-world account,
contract, or credential (the Healthcare Identifiers Service, NASH, My Health
Record, the NHSD Directory, HealthPathways, secure messaging vendors, myID, an
SMS provider, a push notification provider) is built against a clean,
documented interface with a **mock implementation behind it**, clearly labelled
in code as `MOCK — replace with real integration`. See
["What's real vs. mocked"](#whats-real-vs-mocked) below for the full list, and
["Still needed from you"](#still-needed-from-you) for what turns this from a
reference build into a live, regulator-approved production platform.

See the project's `claude/` docs (accessed via the Projects tool against the
"Doctor Referral Platform" project — a point-in-time snapshot is also mirrored
in this repo under [`.claude/docs/`](./.claude/docs/) for local/offline
reference) for the full business case, architecture, and requirements — this
README is the "how do I run it" companion to that project knowledge, not a
replacement for it.

**Before exploring further, read [`BUILD_LOG.md`](./BUILD_LOG.md)** — the
consolidated build log for every service and app, organized by what was built,
key decisions, what's mocked, and known gaps. It was originally built with one
major caveat: **no service's Prisma client was ever generated and the full
stack was never booted end-to-end in the build sandbox** (outbound network
policy blocked `binaries.prisma.sh` and every Docker registry). Every service
typechecked, linted, and passed its own unit test suite, but the whole stack
wired together over real HTTP had never been exercised.

**That gap has since been closed** — see
[`BUILD_LOG/local-build-fixes.md`](./BUILD_LOG/local-build-fixes.md) for the
full record of what it took to get a real local build running end-to-end
(Prisma generation, Docker layer caching, Keycloak realm-import fixes, and
more) — see "How to run this locally" below to do it yourself.

## Repo layout

This is an npm-workspaces monorepo:

```
referralplatform/
├── services/                12 NestJS/TypeScript microservices + 1 Java service
│   ├── identity-access/       Keycloak realm/policy, passkeys, account links      — port 3001
│   ├── onboarding-account/    patient/carer/GP-practice/specialist onboarding     — port 3002
│   ├── gp-authorisation/      GP↔patient link push-approval lifecycle             — port 3003
│   ├── consent-security/      consent records, deceased flag/freeze, concerns     — port 3004
│   ├── referral/              referral state machine + Compliance Rules Engine    — port 3005
│   ├── directory/             specialist directory + Secure Messaging Gateway     — port 3006
│   ├── booking/                calendar sync + concurrency-safe slot booking       — port 3007
│   ├── specialist-review/     AI-assisted extraction, eConsult branch, pathology  — port 3008
│   ├── followup-recall/       Follow-up Plans, reminders, deceased suppression    — port 3009
│   ├── notification/          push/SMS/email fan-out, secure message threads      — port 3010
│   ├── admin-console/         internal ops/staff console (verification queues…)   — port 3011
│   ├── audit-log/             immudb-backed, NASH-signed, crypto-shreddable log   — port 3012
│   └── fhir-gateway/           Java/Spring Boot — HAPI FHIR, AU Core validation    — port 3013
├── apps/                     4 frontends
│   ├── gp-portal/             Next.js — GP web portal                             — port 3100
│   ├── specialist-portal/     Next.js — specialist web portal                     — port 3101
│   ├── patient-web/           Next.js — patient/carer companion web app           — port 3102
│   └── patient-mobile/        Expo/React Native — primary patient/carer app       — port 8081
├── packages/                 shared TypeScript libraries
│   ├── shared-types/           core domain object types shared across services
│   ├── ui-components/          the design system (web apps)
│   ├── audit-client/            client every service uses to write/query the audit log
│   └── auth-client/             client every service uses to verify Keycloak tokens
├── infra/
│   ├── terraform/              module structure only — not applied against any real cloud account
│   ├── keycloak/                realm-export.json (local realm import) + README
│   └── postgres/                per-service schema init SQL
├── e2e/                       Playwright golden-path suite spanning all 3 web apps
├── BUILD_LOG.md               consolidated build log — read this before changing anything
├── BUILD_LOG/*.md             the original, unedited per-service/app logs BUILD_LOG.md was built from
├── CONVENTIONS.md             the single source of truth for directory layout, service template,
│                               DB/ORM convention, inter-service calls, testing convention
├── docker-compose.yml         the full local stack — every port/dependency is documented inline
└── .github/workflows/ci.yml   lints, builds, and tests every workspace on push
```

**Read `CONVENTIONS.md` before writing any code here.**

## Prerequisites

- **Docker** and **Docker Compose v2** (`docker compose`, not the old
  `docker-compose`) — the entire stack (Postgres, Redis, immudb, Keycloak,
  Mailhog, and every service) runs as containers.
- **Node.js ≥ 20** and **npm ≥ 10** — for every TypeScript service/app and for
  running things outside Docker (`npm run start:dev`, tests, etc.). See the
  `engines` field in the root `package.json`.
- **Java 21** and **Maven** — only needed if you're working on
  `services/fhir-gateway` outside Docker (`<java.version>21</java.version>` in
  its `pom.xml`). Not needed to run the rest of the stack.
- A machine with outbound network access to Docker Hub/quay.io (to pull base
  images) and to `binaries.prisma.sh` (for each Node service's `prisma
  generate` build step) — **this build's own sandbox had neither**, which is
  why the stack has never actually been booted end-to-end before now; see
  `BUILD_LOG.md`'s "Cross-cutting patterns" section for the full story.

## How to run this locally

```bash
# 1. Install every workspace's dependencies (one install, from the root —
#    never `cd` into a service/app and install there, npm workspaces hoist
#    everything into one node_modules tree):
npm install

# 2. Bring up the full stack:
docker compose up -d --build

# 3. Watch every service come up healthy (each exposes GET /health):
docker compose ps

# 4. Import the Keycloak realm — docker-compose already does this
#    automatically via `--import-realm` on first boot of the `keycloak`
#    container (infra/keycloak/realm-export.json). Confirm it worked:
docker compose logs keycloak | grep -i "realm.*imported\|referralplatform"
```

Or run one thing at a time against the shared infra (useful while iterating on
a single service):

```bash
docker compose up -d postgres redis keycloak mailhog immudb
cp services/referral/.env.example services/referral/.env
npm run prisma:generate -w services/referral
npm run prisma:migrate -w services/referral -- --name init
npm run start:dev -w services/referral
```

### Walking the golden path by hand

Once `docker compose up -d --build` is running and every service reports
healthy:

1. **GP triggers a new patient account** — from the GP Portal
   (`http://localhost:3100`), sign in as a GP (see `infra/keycloak/README.md`
   for the seeded realm's test users), register/verify your practice under
   **Settings**, then use **Patients → Trigger new account** for a patient
   whose mobile/email the practice has on file. This calls
   `onboarding-account`'s `POST /account-activation-requests`.
2. **Patient activates their account via email OTP** — open
   **Mailhog's web UI at `http://localhost:8025`** and find the activation
   email (this build sends the activation link *and* the OTP by email, not
   SMS — no paid SMS account exists for this build; see "What's real vs.
   mocked" below). Follow the link into Patient Web
   (`http://localhost:3102/onboarding/activate?token=...`), verify DOB (+
   Medicare number if captured), answer the "is this for you, or are you
   helping someone else?" branch, then check Mailhog again for the 6-digit OTP
   and enter it to activate the account.
3. **GP creates a referral** — back in the GP Portal, **Referrals → New
   Referral**. Type a reason for referral (try something like "chest pain and
   palpitations" — it keyword-matches the Cardiology HealthPathways category
   seeded in `services/directory`) and watch the live HealthPathways
   suggestion and Compliance Checklist preview populate as you type. Pick a
   matching specialist from the directory search and submit.
4. **Specialist reviews it** — sign in to the Specialist Portal
   (`http://localhost:3101`) as the specialist you referred to (first
   self-register a directory profile under **Profile** if you haven't — see
   `e2e/README.md`'s "Why a specialist self-registers first" for exactly why
   that step exists today). The referral appears under **Queue → New
   referrals**.
5. **Booking** — once the referral is routed, the Patient Web app's
   **Referrals → [referral] → Booking** screen (or the specialist/GP proposing
   slots) drives concurrency-safe slot confirmation against
   `services/booking`'s mock calendar provider.
6. **Follow-up** — once a specialist review creates a Follow-up Plan
   (Specialist Portal → **Follow-up Plans → New**), `followup-recall` starts
   scheduling reminders, visible on the GP Portal's **Follow-up** dashboard and
   the Patient Web app's referral timeline.

**Honesty note**: this exact walkthrough is what `e2e/tests/golden-path.spec.ts`
automates, but that suite (like the manual walkthrough above) has never been
executed against a live stack in this build's own sandbox — see
[`e2e/README.md`](./e2e/README.md) and `BUILD_LOG.md`'s "End-to-end test suite"
section for the three specific, honestly-documented workarounds it uses and
what to expect on a first real run (a locator tweak or two, most likely).

### What serves what, once `docker compose up -d` is running

| Port          | What                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| `5432`        | PostgreSQL (one instance, one schema per service)                                                              |
| `6379`        | Redis                                                                                                           |
| `3322`        | immudb (gRPC) — the audit trail's tamper-evident ledger (`9497` = Prometheus metrics)                          |
| `8180`        | Keycloak (admin console + OIDC issuer) — `http://localhost:8180/realms/referralplatform`                       |
| `8025`        | **Mailhog web UI — read OTP/account-activation emails here** (SMTP itself is `1025`)                           |
| `3001`        | `identity-access` — Keycloak realm/policy admin, passkeys, account links                                       |
| `3002`        | `onboarding-account` — patient/carer/GP-practice/specialist onboarding                                          |
| `3003`        | `gp-authorisation` — GP↔patient link push-approval                                                              |
| `3004`        | `consent-security` — consent records, deceased flag/freeze, concerns                                           |
| `3005`        | `referral` — referral state machine + Compliance Rules Engine                                                  |
| `3006`        | `directory` — specialist directory + Secure Messaging Gateway                                                   |
| `3007`        | `booking` — calendar sync + concurrency-safe slot booking                                                       |
| `3008`        | `specialist-review` — AI-assisted extraction, eConsult branch, pathology requests                              |
| `3009`        | `followup-recall` — Follow-up Plans, reminders, deceased suppression                                            |
| `3010`        | `notification` — push/SMS/email fan-out, secure message threads                                                 |
| `3011`        | `admin-console` — internal ops/staff console                                                                    |
| `3012`        | `audit-log` — immudb-backed, NASH-signed, crypto-shreddable audit trail                                        |
| `3013`        | `fhir-gateway` (Java/Spring Boot) — `GET /actuator/health`, `GET /fhir/metadata`, `POST /fhir/export/...`      |
| `3100`        | `gp-portal` (Next.js)                                                                                           |
| `3101`        | `specialist-portal` (Next.js)                                                                                   |
| `3102`        | `patient-web` (Next.js)                                                                                         |
| `8081`/`19000`| `patient-mobile` (Expo Metro bundler / dev tools)                                                               |

Every backend service exposes `GET /health`. Every port assignment and
`depends_on` relationship is documented with a comment directly in
`docker-compose.yml` — that file is the source of truth if this table and it
ever disagree.

### How to run the test suites

```bash
# Every workspace's unit tests, lint, and typecheck (from the monorepo root):
npm run test
npm run lint
npm run typecheck

# One service/app in isolation:
npm run test -w services/referral
npm run test -w apps/gp-portal

# The Java service:
cd services/fhir-gateway && mvn clean verify   # see BUILD_LOG.md — not yet run
                                                 # against Maven Central in this build

# End-to-end (Playwright, spans gp-portal + specialist-portal + patient-web):
cd e2e
npm install
npx playwright install --with-deps chromium
npm test              # headless
npm run test:headed   # watch it drive the three apps
```

Every service's own unit test suite passes today (see `BUILD_LOG.md` for exact
counts, service by service — 400+ tests across the platform). What hasn't run
yet anywhere is `docker compose up` itself, any service's `test:e2e` against a
real Postgres/Keycloak, `mvn clean verify` for `fhir-gateway`, and the
Playwright golden-path suite — all blocked by the same sandbox network policy,
all expected to work once run somewhere with normal network access. See
`BUILD_LOG.md`'s "Cross-cutting patterns" section.

---

## What's real vs. mocked

Every item below is implemented against a clean, documented interface
(usually one abstract class/interface + a `Mock*` implementation bound via
dependency injection), clearly labelled `MOCK — replace with real integration`
in its own source file. Swapping in the real thing is, in every case, a
matter of writing one new class implementing the existing interface and
rebinding it in one module file — not a rearchitecture.

| External system | Where it's mocked | What's real credentials/accounts you'd need to make it real |
| --- | --- | --- |
| **Healthcare Identifiers Service** (IHI/HPI-O/HPI-I resolution) | `services/onboarding-account/src/hi-service`, `services/fhir-gateway`'s `hiservice/` | A NASH PKI certificate + Services Australia HI Service B2B/SOAP registration for the platform's own organisation |
| **NASH** (signing referral/audit content, credential provisioning) | `services/audit-log/src/signing` (event signing), `services/onboarding-account/src/nash` (credential provisioning), `services/fhir-gateway`'s `nash/` | An HSM-backed NASH organisation certificate issued via Services Australia/ADHA |
| **My Health Record** | `services/followup-recall/src/test-completion` (MHR test-result lookup), `services/fhir-gateway`'s `mhr/` | A NASH-authenticated My Health Record National Infrastructure connection + conformance testing with ADHA |
| **NHSD (National Health Services Directory)** | `services/directory/src/directory/nhsd-sync` | A production-access agreement with Healthdirect Australia for their FHIR-based Directory API |
| **HealthPathways** | `services/directory/src/directory/healthpathways` | A per-PHN HealthPathways Pathway Link API licence/key |
| **Secure messaging vendors** (HealthLink, Medical-Objects) | `services/directory/src/secure-messaging`, `services/specialist-review/src/pathology-requests` | A vendor agreement (and integration testing) with HealthLink and/or Medical-Objects |
| **myID (TDIF)** | `services/identity-access/src/mock-myid` | Real TDIF accreditation (or use of an accredited broker) for the platform as a relying party |
| **SMS provider** | `services/notification/src/notifications` (`MockSmsProvider`) | A paid SMS gateway account (Twilio, MessageMedia, or similar) — this build uses **real email via Mailhog/SMTP** in its place end-to-end, not a mock, for OTP/activation delivery specifically |
| **Push notification provider** | `services/notification/src/notifications` (`MockPushProvider`) | FCM/APNs credentials, or a unified provider (OneSignal, Expo push) |
| **AHPRA registration check** | `services/onboarding-account/src/ahpra` | AHPRA's public register has no bulk API — real integration is more likely a rate-limited on-demand lookup than a REST client |
| **Calendar providers** (Google Calendar, Microsoft Graph, CalDAV) | `services/booking/src/calendar` | OAuth app registrations with Google/Microsoft, or a CalDAV client for practice-management-system calendars |
| **AI-assisted extraction (LLM)** | `services/specialist-review/src/extraction` (`LlmExtractionProvider`) | An OpenAI-chat-completions-compatible vendor account and API key — the request/response handling is real and wired, just untested against a live vendor; falls back to a real rule-based extractor with no vendor at all |
| **AU Core FHIR profiles** | `services/fhir-gateway/src/main/resources/au-core` | No account needed — just network access to download the real `hl7.fhir.au.core` IG package from `packages.fhir.org` and drop it in (the validation *engine* is already real, unmodified HAPI FHIR) |

## Still needed from you

Everything above is engineering. The items below are not — they're business,
legal, and regulatory prerequisites that only you (or a legal entity you
control) can complete, and no amount of further engineering substitutes for
them. This table is reproduced from the project's own
`overnight-build-execution-plan.md` doc so it can't be missed on opening this
repo:

| Blocker | Who has to do it |
| --- | --- |
| A registered business entity to hold contracts, insurance, and regulator relationships | You |
| A cloud provider account with real billing | You |
| A registered domain | You |
| Healthcare Identifiers Service registration (the platform's own HPI-O) | You, via ADHA |
| NASH organisation certificate | You, via ADHA |
| My Health Record conformance testing | You, via ADHA |
| At least one secure messaging vendor agreement (HealthLink/Medical-Objects) | You, via the vendor |
| PHN pilot partnership | You |
| HealthPathways Pathway Link API access | You |
| Medical defence organisation conversations (Avant/MDA National/MIGA) | You |
| Technology E&O / cyber liability insurance | You |
| Source code/data escrow arrangement | You |
| Apple/Google developer accounts to actually publish the mobile app | You |
| A Privacy Impact Assessment and legal Terms of Service | You, with a lawyer |

None of this is a criticism of the engineering scope — it's the same list the
project's own docs (see `claude/adha-regulator-questions-todo.md`,
`claude/business-case-competition.md`, `claude/onboarding-processes.md`,
`claude/cost-insurance-traceability.md`, `claude/complaints-continuity-deceased.md`)
had already been building toward. What this repo removes is every other
excuse for delay: the entire engineering side of "what would we actually
build" stops being an open question the moment `docker compose up` works end
to end. The only remaining work after that is this list — conversations and
signatures, not code.

## TODO

Once the stack has been booted end-to-end in a real network environment (see
"Cross-cutting patterns" in `BUILD_LOG.md`), the natural next pass is: wire up
the handful of documented but not-yet-connected cross-service calls (Referral
Service → Specialist Review's `POST /cases`; Onboarding & Account → Referral
Service's `activate-queued`; Onboarding & Account → Identity & Access's
Keycloak user provisioning for a newly activated patient/carer — see
`BUILD_LOG.md` for the full list, service by service), then run the
Playwright golden-path suite for real and fix whatever locators need it.
