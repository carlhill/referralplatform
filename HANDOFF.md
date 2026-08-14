# Moving ReferralPlatform to Claude Code on your own machine

*Prepared 14 August 2026. This file exists to get you from "downloaded archive" to "Claude Code session that has full context and can pick up exactly where this one left off." It doesn't repeat what's already well covered elsewhere — `README.md` is the real operating manual (setup, golden-path walkthrough, port table, test commands) and `BUILD_LOG.md` is the detailed build history. Read this file first, then those.*

## What's in this package

- **The whole monorepo** — 12 NestJS/TypeScript microservices, 1 Java/Spring Boot FHIR gateway, 4 frontend apps (GP portal, specialist portal, patient web, patient mobile), shared packages, infra config, and a Playwright end-to-end suite. Full git history is included (10 commits, from initial scaffold through the final docs pass).
- **`.claude/docs/`** — a snapshot of all 24 design documents from the "Doctor Referral Platform" claude.ai Project (identity/security, business case, compliance, architecture, cost/insurance, and the rest). These aren't referenced by the code itself, but they're the *why* behind almost every decision the code makes, and Claude Code should read the relevant ones before making significant changes — see "Handing this to Claude Code" below.
- **What's deliberately excluded**: `node_modules` (all of them — root, and the one nested one in `apps/patient-mobile`), every `.next` build folder, and every service's compiled `dist/` folder. All regenerate from `npm install` / `npm run build` — including them would have made this download roughly 40x larger for zero benefit.

## Prerequisites on your machine

Straight from `README.md`, repeated here because it's the first thing that will block you if missing:

- **Docker** and **Docker Compose v2** (the `docker compose` command, not the old standalone `docker-compose`)
- **Node.js ≥ 20** and **npm ≥ 10**
- **Java 21** and **Maven** — only if you'll work on `services/fhir-gateway` outside Docker
- **Real outbound network access** to Docker Hub/quay.io and to `binaries.prisma.sh` — this is the one thing the build sandbox this was built in genuinely did not have, which is why the stack has never been booted end-to-end. Your machine almost certainly has this already; it's worth naming explicitly because it's the single most important difference between where this was built and where you're taking it.

## Getting it running

```bash
# 1. Unpack
tar -xzf referralplatform-source.tar.gz
cd referralplatform

# 2. Install everything (one command, from the root)
npm install

# 3. Bring up the full stack
docker compose up -d --build

# 4. Confirm everything's healthy
docker compose ps
```

From here, follow **README.md's "Walking the golden path by hand"** section — it's a real, numbered walkthrough (GP triggers an account → patient activates via a Mailhog-caught OTP email → GP creates a referral with live HealthPathways suggestions → specialist reviews it → booking → follow-up plan) that exercises every module we designed together.

**The first real milestone isn't "does the UI look right" — it's "does `docker compose up -d --build` succeed and does every service report healthy."** That single step has never actually happened yet (see `BUILD_LOG.md`'s "Cross-cutting patterns" section for why), so treat it as the first thing to verify, not something to assume.

## Priority order for what to fix first

Once the stack boots, `README.md`'s own "TODO" section and `BUILD_LOG.md` list every open item, but three are worth calling out because they block the golden path specifically, in order of how much they'll block you:

1. **No Keycloak user is ever provisioned when a patient/carer account activates.** This means patient/carer login has no real account to sign into yet — the single biggest gap standing between "the code is real" and "you can actually click through it as a patient." Fix location: `services/onboarding-account` needs to call `identity-access`'s Keycloak user-provisioning at account activation.
2. **Nothing calls `specialist-review`'s `POST /cases`** after a referral is booked — three separate service `BUILD_LOG` entries independently flagged this as out of their own scope, so it fell through the cracks between services. Fix location: wire this from `services/referral` or `services/booking` once a booking confirms.
3. **Every service's Prisma client was hand-authored SQL, never machine-generated**, because `binaries.prisma.sh` was blocked in the build sandbox. Running `prisma generate` for real (which `npm install` plus the setup steps above should trigger) is what turns this from "looks right" to "actually typechecks against a real generated client" — do this before trusting any service's behavior at the edges.

## Handing this to Claude Code

Point Claude Code at the unpacked `referralplatform/` directory and give it a first prompt along these lines — adjust to taste, but make sure it reads `CONVENTIONS.md` and the relevant `.claude/docs/` before touching anything:

> This is ReferralPlatform, an Australian GP-to-specialist referral platform. Before doing anything else, read `README.md`, `BUILD_LOG.md`, and `CONVENTIONS.md` in full, and skim `.claude/docs/` for the design rationale behind whatever you're about to touch. The stack has never been booted end-to-end — help me get `docker compose up -d --build` working first, then work through the priority list in `HANDOFF.md`. Don't change established conventions (service template, DB/ORM pattern, inter-service call pattern) without flagging it to me first — `CONVENTIONS.md` exists specifically so many contributors (human or AI) stay consistent with each other.

A few things worth telling Claude Code explicitly, since it won't have this conversation's context:

- **`CONVENTIONS.md` is load-bearing** — it's what kept 26 separate build agents consistent with each other across this build. Any future work (by Claude Code or otherwise) should follow it, not improvise a new pattern per service.
- **The `.claude/docs/` folder is reference material, not something to keep in sync with code changes.** It's a snapshot of the design conversation that produced this build. If Claude Code makes a decision that meaningfully contradicts one of these docs, that's worth surfacing to you, not silently overriding.
- **The original living design documents remain in your claude.ai "Doctor Referral Platform" Project** — `.claude/docs/` here is a portable copy for Claude Code's benefit, not a replacement. If you want to keep designing at the business/requirements level (new features, new compliance questions, new research), that's still better done in a Claude conversation attached to that project; bring the outcome back into this repo's `.claude/docs/` folder afterward if it's worth keeping alongside the code.

## The non-engineering checklist

`README.md`'s "Still needed from you" table lists everything that isn't code — business entity, HI Service/NASH registration, a secure messaging vendor agreement, PHN partnership, insurance, legal ToS, and the rest. None of that gets resolved by more building, in Claude Code or otherwise — it's the conversations and signatures this whole project has been pointing toward from the start.
