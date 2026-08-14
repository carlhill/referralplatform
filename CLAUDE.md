# ReferralPlatform

Australian GP-to-specialist referral platform. Automates referral handoff between GPs, specialists, and patients/carers, with a signed audit trail, native booking, and consent-based traceability designed to eventually connect to a single national (MyGov-facing) traceability layer.

**Read before making any non-trivial change:**

1. `CONVENTIONS.md` — the single source of truth for directory layout, the NestJS service template, the DB/ORM convention, how services call each other, and the testing convention. Twenty-six separate build agents stayed consistent with each other by following this file; don't improvise a new pattern per service.
2. `README.md` — how to run the stack, the golden-path walkthrough, the port table, and the "what's real vs. mocked" table for every external integration.
3. `BUILD_LOG.md` — what was actually built vs. scaffolded, service by service, and the known gaps.
4. `HANDOFF.md` — written specifically for picking this project back up outside the sandbox it was built in: setup steps, and the priority-ordered list of what to fix first.

## Design reference — `.claude/docs/`

`.claude/docs/` holds a snapshot of the 22 design documents (plus 2 diagrams) from the project's "Doctor Referral Platform" workspace on claude.ai — the design conversation that produced this codebase. Read the relevant one before making a decision that touches its area, rather than re-deriving the reasoning from scratch:

- **Identity, security & onboarding**: `identity-security-recommendations.md`, `onboarding-processes.md`, `minors-multigp-exception-paths.md`, `audit-pathology-medicare-deepdive.md`, `audit-log-architecture-decision.md`, `gdpr-applicability.md`, `complaints-continuity-deceased.md`
- **Business case & domain research**: `business-case-competition.md`, `phase2-justice-social-services.md`, `state-by-state-information-sharing-schemes.md`, `feature-ideas-compliance-recall-telehealth.md`, `patient-centered-recall-ai-intake.md`, `specialist-directory-booking.md`, `research-sources-index.md`
- **Requirements & architecture**: `modules-and-requirements.md`, `solution-architecture-tech-stack.md`, `ui-design.md`, `business-process-flow.md` (+ `business-process-flow.html` for the interactive diagram), `onboarding-processes.md`
- **Operational**: `cost-insurance-traceability.md`, `adha-regulator-questions-todo.md`, `glossary.md`, `overnight-build-execution-plan.md`
- **UI reference**: `ui-mockup.html`

**Important**: this folder is a point-in-time snapshot, not a live sync. The authoritative, evolving version of this design conversation lives in the "Doctor Referral Platform" project on claude.ai. If a change here meaningfully contradicts something in one of these docs, that's worth surfacing to the project owner rather than silently overriding — and if the design conversation moves forward there, the useful outcome should get copied back into this folder so it doesn't go stale.

## Known priority gaps (see `HANDOFF.md` for full detail)

1. No Keycloak user is provisioned when a patient/carer account activates — patient/carer login has no real account to sign into yet.
2. Nothing calls `specialist-review`'s `POST /cases` after a referral is booked.
3. Every service's Prisma client was hand-authored SQL, never machine-generated (`binaries.prisma.sh` was blocked in the build sandbox) — run `prisma generate` for real before trusting behavior at the edges.
4. The full stack has never been booted via `docker compose up` — that's the first thing to verify, not something to assume works.
