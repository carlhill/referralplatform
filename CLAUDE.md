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

## Build/verify working style (Carl's explicit instruction, 2026-08-14)

The stack was never built or run before this repo was handed off (see gap #4 below), so getting it working means fixing real, previously-undiscovered bugs one at a time across 21 services. That process MUST follow this order — do not deviate without asking first:

1. **Pick one service. Take it all the way to actually running and verified** (built, container up, health check passing, not just `tsc`/`mvn` compiling) before touching any other service.
2. **Extract the common pattern** behind whatever was fixed — most bugs here repeat across services that share a template (e.g. the same hand-authored Prisma bridge-interface bug appeared in ~10 files).
3. **Apply the proven pattern to the other services**, but still verify each one individually — don't assume the pattern transfers without checking.
4. **Never run a full 21-service `docker compose up -d --build` as the default move for a single-file fix.** Build/verify only the specific affected service (`docker compose build <service>`). Only run a full-stack build as a deliberate, infrequent regression check once individual pieces are known-good — and say explicitly when you're doing that and why.
5. If a `docker compose build`/`up` command is stopped (e.g. via TaskStop on its wrapper process), that does **not** cancel the build server-side inside BuildKit/WSL2 — it can keep running and consuming memory. Verify with `docker ps` / a memory check, and explicitly cancel via the Docker/BuildKit side if needed, not just by killing the local shell wrapper.

This machine has limited RAM (16GB) and Docker Desktop's WSL2 VM does not release memory back to Windows on its own, even across a Docker Desktop app restart — if the shell or Docker becomes unresponsive, check free memory first (`Get-CimInstance Win32_OperatingSystem`) before assuming it's a code problem, and use `wsl --shutdown` (not just restarting the Docker Desktop app) to actually reclaim it. Sometimes a single `wsl --shutdown` leaves a second, stale `VmmemWSL` process behind (visible in Task Manager as two separate `VmmemWSL` rows, e.g. 7.7GB + 3.85GB — PowerShell's `Get-Process vmmemWSL` may only show one of them) — if memory is still critically low right after a shutdown, check Task Manager for a duplicate and run `wsl --shutdown` a second time; that clears both.

**A 21-service Docker Compose stack does not fit comfortably on this 16GB machine all at once.** Even with only infra running, `vmmemWSL` sits around 4-8GB. Bringing up more than a handful of app services simultaneously reliably drives free memory to <1GB and causes already-verified services to hang (not crash — the Node process stays alive but stops responding; `docker exec ... ps aux` shows it running but unresponsive). Don't bring up the whole stack for routine work — start only the specific services (+ their real `depends_on` chain) needed for whatever's being tested right now, and `docker compose stop` others once done with them. Be aware that `docker compose up -d <service>` pulls in its transitive dependency chain automatically, which can be larger than expected — check what actually started, not just what was requested.

## Known priority gaps (see `HANDOFF.md` for full detail)

1. No Keycloak user is provisioned when a patient/carer account activates — patient/carer login has no real account to sign into yet.
2. Nothing calls `specialist-review`'s `POST /cases` after a referral is booked.
3. Every service's Prisma client was hand-authored SQL, never machine-generated (`binaries.prisma.sh` was blocked in the build sandbox) — run `prisma generate` for real before trusting behavior at the edges.
4. The full stack has never been booted via `docker compose up` — that's the first thing to verify, not something to assume works.
