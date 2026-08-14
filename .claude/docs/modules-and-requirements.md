# Modules and technical requirements

*Prepared 13 August 2026. Maps the eight business-process modules already agreed in `business-process-flow.md` (v3) onto concrete services, then lists the full functional and non-functional requirements. This is the level of detail a build should actually start from.*

## 1. Module / service list

Each of these is a separately deployable service (or, for the three UI surfaces, a separately deployable frontend) — this is the microservice boundary, chosen along the same lines the business process flow already draws, not an arbitrary technical split.

| # | Service | What it does |
|---|---|---|
| 1 | **Identity & Access Service** | Authenticates every user type (patient, carer/delegate, GP, specialist, internal staff). Issues and validates passkeys/WebAuthn credentials, OTP flows, and OIDC tokens. Hosts the myID relying-party integration. Built on Keycloak. |
| 2 | **Onboarding & Account Service** | The SMS-link → DOB/Medicare verification → patient-vs-carer branch → OTP activation flow. Owns the patient/carer/delegate account model and the IHI-based EMPI/deduplication logic. |
| 3 | **GP Authorisation Service** | The "new GP not yet linked" push-approval flow (module 1B) — links/unlinks GPs to an existing patient account, enforces that only HPI-O/NASH-authenticated practice systems can trigger a link request. |
| 4 | **Consent & Security Service** | The consent page (who can see referrals sent/received), the linked-GP/practice management UI, periodic carer/delegate re-attestation, the "raise a concern" triage engine, and the deceased-patient flag/freeze workflow. |
| 5 | **Referral Service** | Referral creation, the urgent fast-path flag, the 2-day activation queue and its lapse/notify path, and referral state management end to end (created → routed → booked → reviewed → followed up). |
| 6 | **Compliance Rules Engine** | The jurisdiction-keyed rules layer — child/DV/complex flags, state-by-state WWCC applicability, state-by-state information-sharing scheme rules. Deliberately **data-driven** (rules stored as versioned, editable configuration, not hardcoded conditionals) so legal/compliance changes don't require a code deploy. |
| 7 | **Directory Service** | The specialist/GP directory — scheduled NHSD sync, self-registered profile management (which supersedes synced data once a specialist is active), and the HealthPathways Pathway Link API integration for "suggest the right specialist type." |
| 8 | **Secure Messaging Gateway** | Routes referrals via existing secure messaging rails (HealthLink/Medical-Objects) or directly to onboarded specialists. Abstracts vendor-specific protocols behind one internal interface so adding a second secure messaging vendor doesn't touch referral logic. |
| 9 | **Booking Service** | Calendar free/busy sync (Google/Outlook/CalDAV), preference capture and matching, waitlist management, the urgent-fast-path direct-offer flow, and the cancellation/dual-notification path. The single largest module, per the earlier cost breakdown. |
| 10 | **Specialist Review Service** | AI-assisted structured extraction of referral content for the specialist, the eConsult-style async-advice branch, and pre-visit pathology/imaging request handling. |
| 11 | **Follow-up & Recall Service** | Follow-up Plan management, multi-channel reminder scheduling, automatic pathology/MHR-based test-completion detection with self-report fallback, escalating reminders, and reminder suppression on the deceased-patient trigger. |
| 12 | **Audit Log Service** | The immudb-backed, NASH-signed audit trail described in `audit-log-architecture-decision.md`, plus its query/verification API. |
| 13 | **Notification Service** | Push/SMS/email fan-out for every notification type across the platform, and the referral-scoped secure message thread used to resolve exceptions. |
| 14 | **Integration & FHIR Gateway** | The HAPI FHIR-based service handling My Health Record conformance, Healthcare Identifiers Service lookups (IHI/HPI-O/HPI-I), NASH signing operations, and the structured FHIR export capability (business continuity requirement). |
| 15 | **Admin/Ops Console** | Internal staff tooling — AHPRA/WWCC manual verification review, deceased-patient executor/family/coroner access-request review, PHN/practice onboarding management, and audit-log query access for support/compliance staff. |
| 16 | **Patient/Carer Mobile App** (+ companion web) | The primary patient/carer surface — React Native. |
| 17 | **GP Web Portal** | Next.js web app for GPs and practice staff. |
| 18 | **Specialist Web Portal** | Next.js web app for specialists and their practice staff. |

## 2. Functional requirements, by module

Only the requirements that materially shape the build are listed here — this is a build-starting-point, not exhaustive user-story-level detail (that's the next artifact after this plan is approved).

**Identity & Access:** support four distinct authenticated principal types with different credential strength requirements (patient/carer: OTP + optional passkey; GP/specialist: passkey or equivalent phishing-resistant credential expected, not just optional — per the AAL2/AAL3 distinction already researched); support step-up authentication for sensitive actions (approving a new GP link, granting deceased-patient access); accept myID as an OIDC relying party without requiring the platform to seek its own TDIF accreditation. **Support optional Google and Microsoft social login (via Keycloak brokering) strictly as a secondary sign-in method a user can link after their account is already identity-verified — never as a path to create or activate an account, and never able to skip the OTP/DOB/Medicare verification.** Facebook is deliberately excluded as a login provider given Meta's ad-tech data-leakage history on health-adjacent sites.

**Onboarding & Account:** implement the full 7-step flow from `identity-security-recommendations.md` including the carer-vs-patient branch and the carer's own OTP/email verification; deduplicate on IHI, not Medicare number or name/DOB alone; support the 2-day queue-then-delete timing from the original brief. **OTP delivery channel is pluggable** — production design remains SMS to the mobile number the GP's practice already has on file (that binding is the actual security property, not just a delivery preference); for this build, with no paid SMS account available, the OTP provider implementation sends a **6-digit code by email** instead (bumped up from the original 4-digit SMS spec, since email is a lower-assurance channel with no SIM-possession guarantee — compensating controls: 10-minute expiry, rate-limited send, lockout after 5 failed attempts). Swapping in a real SMS provider (Twilio or similar) later is a config change against the same interface, not a redesign.

**GP Authorisation:** block referral creation until a push-approval is granted for any GP not already linked; support multiple concurrently linked GPs per patient; log every link/unlink event to the audit trail.

**Consent & Security:** consent must be settable per-referral, not just account-wide (a patient may want a mental-health referral hidden from a GP who can see everything else); the "raise a concern" triage must correctly route to AHPRA/state complaints bodies vs. internal support vs. the Privacy Officer without requiring the user to know which category applies — the UI asks plain-language questions, not "select a category."

**Referral Service:** referral state must be fully auditable and resumable — a referral interrupted at any state (e.g. platform outage mid-queue) must be recoverable to a consistent state, not lost or duplicated.

**Compliance Rules Engine:** rules must be versioned (so a referral created under an old rule set is auditable against the rules that actually applied at the time, not the current ones) and editable by authorised compliance staff without a code deploy.

**Directory Service:** self-registered specialist data must always win over synced NHSD data for the same entity; sync jobs must be idempotent and safely re-runnable; HealthPathways suggestions must degrade gracefully to a static link if the inline-guidance integration (Phase 2 of that feature) isn't available for a given PHN region.

**Secure Messaging Gateway:** must support at least one live vendor integration at MVP (HealthLink or Medical-Objects, whichever the pilot PHN's practices predominantly use) with a clean interface for adding a second later; must not silently fail a routed referral — a delivery failure must generate a dual-notification exception, per the flow.

**Booking Service:** must handle concurrent booking attempts on the same slot correctly (no double-booking — this needs real database-level locking or optimistic concurrency control, not just application-layer checks); calendar sync must be two-way (a confirmed booking written to the specialist's real calendar, and changes made in that calendar reflected back).

**Specialist Review Service:** AI-assisted extraction output must always be presented as a structured *summary for review*, never as an auto-submitted clinical action — the specialist must explicitly confirm before anything downstream happens, consistent with the Babylon Health cautionary guardrails already designed.

**Follow-up & Recall Service:** reminder suppression on the deceased-patient trigger must be immediate and must apply to already-scheduled-but-not-yet-sent reminders, not just future ones.

**Audit Log Service:** see the dedicated doc — every clinical/consent write produces a corresponding signed entry, structurally enforced.

**Notification Service:** must support push, SMS, and email, with push as the primary channel for time-sensitive events (per the exception-path design) and SMS/email as fallback for users without the app installed or without notifications enabled. **For this build specifically, the SMS provider is a mock (no paid account exists); the OTP/account-activation channel runs on real email delivery instead so onboarding is actually testable end-to-end**, with SMS wired against the same interface for when a real provider account exists.

**Integration & FHIR Gateway:** referral exports must validate against AU Core FHIR profiles; IHI/HPI-O/HPI-I lookups must fail safely (block the dependent action with a clear error) rather than silently proceeding without verified identifiers.

## 3. Non-functional requirements

**Security**
- OWASP ASVS Level 2 (minimum) as the target standard for the whole platform, Level 3 for the Identity & Access and Audit Log services specifically.
- TLS 1.2+ everywhere; encryption at rest for all data stores; per-user encryption keys for crypto-shredding-dependent fields.
- Annual third-party penetration test at minimum, plus one before the pilot launch specifically.
- Dependency and container vulnerability scanning on every CI build, not just at release.

**Privacy and compliance**
- Full alignment with the Australian Privacy Principles as the baseline (already the design foundation throughout this project).
- Data residency: Australia only, for all environments including dev/staging, not just production.
- A Privacy Impact Assessment commissioned before the pilot launch (already flagged as a Phase 0 deliverable).
- Audit-log retention aligned to the deceased-patient retention policy already set (7 years from last entry; to age 25 if the patient was a minor at their last entry).

**Performance**
- API response time target: p95 under 500ms for read operations, under 1.5s for write operations involving an audit-log write (the signing operation adds real latency — budget for it rather than discovering it under load).
- Booking-slot confirmation must be near-real-time (under 2 seconds) given it's a competitive-availability operation.

**Availability and disaster recovery**
- Uptime target: 99.9% for the production platform (roughly 8.7 hours of allowed downtime per year) — appropriate for a system in an active clinical pathway but not a life-critical/real-time system requiring 99.99%+.
- RTO (Recovery Time Objective) and RPO (Recovery Point Objective): 4 hours and 15 minutes respectively, as a starting target — these are the numbers to actually validate against the business continuity commitment in `complaints-continuity-deceased.md`, not invent separately.
- Multi-AZ deployment within the primary AU region at minimum; documented (not necessarily active/hot) DR to a second AU region.

**Accessibility**
- WCAG 2.1 AA across all three user-facing surfaces (patient app/web, GP portal, specialist portal) — non-negotiable given the patient population's age range and the platform's own stated inclusivity goals.

**Observability**
- Every service instrumented with OpenTelemetry from day one, not retrofitted — tracing across service boundaries is what makes debugging a multi-service referral flow tractable at all.
- Structured logging (no unstructured `console.log`-style logs in production) with correlation IDs tying logs, traces, and audit-log entries together for a given referral.

**Data retention**
- Standard patient data: retained per the Privacy Act and state health-records retention requirements (varies by state; the compliance rules engine should encode this the same way it encodes WWCC/child-safety rules).
- Deceased-patient data: per Section 3 of `complaints-continuity-deceased.md`.
- Audit log: append-only, effectively indefinite retention (subject to crypto-shredding for erasure requests), consistent with its non-repudiation purpose.
