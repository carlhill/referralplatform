# ReferralPlatform — solution architecture and tech stack

*Prepared 13 August 2026. This is the concrete technical design for everything agreed on in the business process flow (v3) and the fourteen supporting docs in this project. Every choice below is a real recommendation, not a menu — where there's a genuine trade-off, it's named, a default is picked, and the reasoning is given so it can be overridden deliberately rather than by default.*

## Guiding principles for every choice below

1. **Boring technology where it doesn't matter, deliberate technology where it does.** Postgres, not a novel database, for ordinary data. A purpose-built tamper-evident log for the one thing that genuinely needs it (the audit trail).
2. **Open source and vendor-neutral by default.** Every piece of this stack can run on any major cloud or on-prem, and nothing depends on a single vendor's proprietary API where an open standard exists (Terraform over CloudFormation, OpenTelemetry over a proprietary APM SDK, FHIR over a bespoke data format).
3. **Australian data residency is a hard constraint, not a preference**, given the Healthcare Identifiers Service, NASH, My Health Record, and state information-sharing scheme dependencies already documented. Everything below assumes AU-region hosting.
4. **Design for Kubernetes-portability without requiring Kubernetes on day one.** A Phase 1 team of ~9 people running Kubernetes themselves is a common way early-stage health-tech teams burn their engineering time on infrastructure instead of the product. The containers are built to be K8s-ready; the orchestration platform underneath is deliberately simpler until scale actually demands it.

## 1. Core tech stack

### Backend services

**Primary language/framework: TypeScript on Node.js, using NestJS.** NestJS gives structured, testable, dependency-injected services — closer to Spring/enterprise Java in discipline than a bare Express app — while keeping one language across backend, web frontend, and (via React Native) the mobile app. That consistency matters more than usual here because the same small team will own referral logic, booking logic, and UI for the first year.

**Exception — the FHIR/interoperability layer is Java, using HAPI FHIR.** This is a deliberate polyglot choice, not an inconsistency. HAPI FHIR is the de facto open-source FHIR server/toolkit — mature, AU Core-aware, and what most real Australian health-data integrations are actually built on. Reimplementing FHIR resource validation, MHR conformance handling, and IHI/HPI-O/HPI-I lookups in a general-purpose Node library would mean re-solving problems this library has already solved. This service sits behind a clean internal API so the rest of the platform never has to know it's a different language.

### Frontend

- **GP and specialist web portals: React + TypeScript on Next.js.** Server-side rendering helps first-load performance for what is, for these users, a daily-use professional tool. Component layer built on **Radix UI primitives** with a custom design system on top (see `ui-design.md`) rather than a heavier off-the-shelf kit — accessibility (WCAG 2.1 AA, given the patient population's age range) is easier to guarantee when built on unstyled, accessible primitives than retrofitted onto a themed component library.
- **Patient/carer app: React Native (via Expo), one codebase for iOS and Android.** Shares TypeScript types with the backend directly (no second data-modelling effort), and Expo materially speeds up the path to both app stores for a small team. **Passkey/WebAuthn support on React Native is genuinely still maturing** — flagged here as a real risk, not glossed over: budget time to validate platform-native passkey APIs (iOS AutoFill/Android Credential Manager) work acceptably through Expo before committing, with a fallback to strong OTP + device biometric app-lock if passkey support isn't solid enough at build time.
- **Patient/carer companion web app**: same Next.js/React stack as the professional portals, for the "bigger screen" use cases already scoped (document history, linked-GP management).

### Data layer

| Store | Use | Why |
|---|---|---|
| **PostgreSQL** (managed — AWS RDS/Aurora or Azure Database for PostgreSQL) | Primary relational store: accounts, referrals, bookings, Follow-up Plans, directory cache | Mature, strong JSONB support for variable clinical data, native row-level security — genuinely useful for enforcing the consent model (who-can-see-this-referral) at the database layer, not just in application code |
| **immudb** (open source) | The signed, append-only audit log — its own store, separate from Postgres | See `audit-log-architecture-decision.md` for the full reasoning |
| **Redis** | Caching, session state, rate limiting | Standard choice, low risk |
| **Object storage** (S3-compatible, AU region) | Referral letters, document vault uploads, exported FHIR bundles | Encrypted at rest with **per-user keys**, not a single platform-wide key — this is what makes crypto-shredding (destroy the key, not the file) actually work operationally |
| **Postgres full-text search** (initially) | Specialist directory search | Deliberately not standing up Elasticsearch/OpenSearch until directory scale actually needs it — avoids running a second search cluster for a dataset that fits comfortably in Postgres at MVP scale |

### Messaging / async

**A managed cloud queue (AWS SQS/SNS or Azure Service Bus)** for everything asynchronous — reminder scheduling, notification fan-out, secure-messaging dispatch, audit-log write confirmation. Not Kafka at this stage: event-sourcing-at-scale isn't a problem this platform has yet, and running a Kafka cluster is real, ongoing operational overhead a 9-person team doesn't need to carry from day one. Revisit if/when true event-streaming patterns (e.g. real-time directory sync fan-out to many downstream consumers) become a real requirement.

### Containers and orchestration

- **Docker** for every service, no exceptions — this is what makes the "K8s-ready without K8s today" principle real.
- **Phase 1 runtime: AWS ECS Fargate (or Azure Container Apps if Azure is the chosen cloud) instead of Kubernetes.** Same containers, far less operational surface area for a small team — no cluster upgrades, no node management, no separate platform-engineering role needed yet.
- **Kubernetes (EKS/AKS) is the deliberate upgrade path**, not a rejected option — worth moving to once there's a genuine multi-team, multi-cluster, or complex-networking need that Fargate/Container Apps can't cleanly express. Because everything is already containerised the same way, this migration is an infrastructure change, not a rewrite.

### Cloud provider and regions

**AWS, ap-southeast-2 (Sydney) as the primary region**, with Melbourne as a documented DR option. Reasoning: mature IRAP-assessed service catalogue, the deepest Australian government/health-sector precedent among the hyperscalers, and the widest selection of the specific managed services this stack needs (RDS Postgres, ECS Fargate, KMS/CloudHSM, Secrets Manager). **Azure is an equally valid alternative** — several Australian health-tech vendors already researched in this project run on it — and nothing in this architecture is AWS-specific enough to make switching prohibitively expensive if that's the preferred relationship. Pick one and commit; don't build multi-cloud abstractions for a Phase 1 platform.

### Identity and access

**Keycloak (open source, self-hosted)** as the identity provider for GP, specialist, and internal staff logins — OIDC-based, natively supports WebAuthn/passkeys, and is flexible enough to implement the carer/delegate role model and the OTP-based patient flow as custom authentication flows rather than fighting a rigid managed IdP's assumptions. This also directly serves the **myID relying-party integration**: Keycloak can be configured as an OIDC relying party against a TDIF-accredited identity provider, which is exactly the "lightweight path" already recommended over seeking TDIF accreditation directly.

*(If the team decides self-hosting an IdP is more operational burden than it's worth at MVP stage, AWS Cognito is the fallback — but expect to fight it harder on the carer/delegate and OTP-carer flows, which are genuinely non-standard.)*

**Social login (Google, Microsoft) via Keycloak's identity brokering — as a convenience sign-in method layered on top of an already-verified account, never as the way an account gets created or activated.** This is a real distinction, not a formality: a Google or Microsoft login proves someone controls that email/account — it says nothing about whether they're the actual patient tied to a Medicare/IHI record. The whole point of the SMS-link → DOB/Medicare-verify → OTP onboarding flow is to bind the account to a real-world identity the GP's practice software already has on file (the mobile number). So the design is: **complete identity-binding onboarding first, exactly as already designed — then let the user optionally link a Google or Microsoft account for faster future sign-in.** Once linked, either the linked social account or the original credential can sign in; the social login never bypasses the verification step. Keycloak supports Google and Microsoft (Entra ID) as identity-provider brokers out of the box — Microsoft is genuinely useful here beyond convenience, since a lot of AU GP and specialist practices already run Microsoft 365/Entra ID, and could plausibly SSO through their practice's own tenant later.

**Facebook is deliberately left out**, not an oversight. Meta's ad-tech stack (the Meta Pixel and related SDKs) has a well-documented history of leaking sensitive, health-adjacent usage signals into its advertising system even when the integrating site didn't intend it to — this has already triggered real regulatory and class-action exposure for US hospital systems that had a Meta Pixel anywhere near patient-facing pages. Given everything already built into this design around patient privacy, adding Facebook as a login option is a real, known risk for very little benefit, and it's excluded on that basis rather than by omission.

### Secrets and key management

**Cloud-native secrets manager (AWS Secrets Manager) for ordinary application secrets.** Separately and more importantly: **NASH signing keys and any key used for crypto-shredding must live in an HSM-backed key management service (AWS KMS with CloudHSM-backed keys, or an actual HSM if NASH requirements demand it)** — not an environment variable, not a database column. This is the one place in the stack where "enterprise-grade" isn't optional polish; it's what makes the non-repudiation claim in the audit log design actually true rather than asserted.

### Observability ("trackers")

- **OpenTelemetry** for instrumentation across every service — vendor-neutral, so switching the backend later doesn't mean re-instrumenting the whole codebase.
- **Metrics, logs, and traces: Grafana + Prometheus + Loki** (self-hosted or Grafana Cloud, AU-hosted — confirm data residency on whichever is chosen).
- **Error tracking: Sentry** (self-hosted or Sentry's AU-region cloud offering — same residency check applies).
- **Deliberately no third-party user-behaviour/marketing analytics trackers** (no ad-tech pixels, no third-party session-replay tools with default global hosting) — this is a design choice, not an oversight, given everything already built around patient privacy and consent. Any product-usage analytics should be self-hosted (e.g. Plausible or PostHog, self-hosted, AU region) if and when the product team genuinely needs usage data.

### Infrastructure as code and CI/CD

- **Terraform** for all infrastructure — cloud-agnostic on purpose, and the standard enterprise choice over CloudFormation/ARM/Bicep for exactly the portability reasons above.
- **GitHub Actions** for CI/CD, with separate **dev / staging / production environments**, each in its own AWS account (AWS multi-account pattern) — this is the real enterprise-grade move: account-level blast-radius containment, not just environment variables inside one account. Required gates before any deploy to staging or production: automated tests passing, SAST (static analysis), and dependency vulnerability scanning (e.g. Snyk or GitHub's native Dependabot + CodeQL).

### Testing

- **Jest or Vitest** for unit tests across the TypeScript services.
- **Playwright** for web end-to-end tests (GP portal, specialist portal, patient companion web app).
- **Maestro** for mobile end-to-end tests (React Native) — chosen over Detox for lower setup friction with Expo.
- **k6** for load testing ahead of the pilot launch, specifically targeting the booking module (the highest-contention part of the system — concurrent patients competing for the same specialist slot).

## 2. Enterprise-grade standards (not a demo)

Since this is explicitly not meant to be a demo, these are the standards that distinguish a real build from one:

- **Every environment (dev/staging/prod) is a separate cloud account, provisioned entirely from Terraform — no manual console changes, ever, including in dev.**
- **All data encrypted in transit (TLS 1.2+ everywhere, no exceptions) and at rest (database and object storage encryption, application-level encryption for anything crypto-shredding depends on).**
- **RBAC/ABAC enforced at both the application layer and the database layer** (Postgres row-level security) for the consent model — a bug in application logic should not be able to leak a referral to someone the patient hasn't consented to.
- **Every write to a clinical or consent-relevant record produces a corresponding audit log entry** — this isn't optional per-feature; it's a platform-level guarantee enforced architecturally (writes to the domain database and writes to the audit log happen in the same transactional boundary, e.g. via an outbox pattern, so it's structurally impossible to write one without the other).
- **Automated dependency and container image vulnerability scanning on every build, not just at release time.**
- **A documented incident response runbook and on-call rotation before the pilot launch — not after.**
- **Feature flags for anything patient-facing that's new**, so a bad release can be turned off without a full rollback.
- **Structured, versioned API contracts (OpenAPI for REST internal APIs, FHIR resource profiles for the interoperability layer)** — not implicit contracts inferred from whatever the frontend currently sends.

See `modules-and-requirements.md` for the full functional and non-functional requirements list per module, and `audit-log-architecture-decision.md` for the audit trail's specific technical design.
