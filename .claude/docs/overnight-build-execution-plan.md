# The overnight build — what I'll actually do, what I can't, and how I'll stay safe doing it

*Prepared 13 August 2026. Read this one first, honestly — it's the part of the plan that determines whether what you find in the morning is what you're expecting.*

## Yes, I know what you mean — let me say it back so you know I do

"Don't do anything wrong" means: don't touch anything outside this project's sandboxed workspace and its own repository; don't run destructive commands against anything real; don't spend real money, use real payment details, or sign up for real third-party services on your behalf; don't contact real people or real government/clinical systems (no real SMS to real phone numbers, no real API calls to AHPRA/Medicare/My Health Record/NASH/HI Service, even "just to test"); and if something looks like it's heading somewhere irreversible or outside what was actually agreed, stop and tell you rather than pushing through. I'll hold to all of that, plus one thing worth adding on my own account, because it's the version of "wrong" most specific to this project: **I will never report a regulatory, legal, or compliance step as done when it isn't.** Everything in this project — the ADHA conversation, the NASH/HI Service registration, the PHN partnership, the medical indemnity conversations, the insurance — depends on those being real. Faking or glossing over any of them, even implicitly by writing code that pretends a real integration exists, would be the actual "wrong" here, more than any single destructive command.

## The honest scope: what "build the entire solution end-to-end" can mean tonight, and what it can't

**What I can genuinely build, unattended, tonight: a complete, professionally engineered reference implementation of every module in this design** — real code, real architecture, real tests, running end-to-end in a local/sandboxed environment, following everything in the tech stack, audit log, module, requirements, and UI design docs already produced. Every external system this platform depends on that requires a real-world account, contract, or credential — the Healthcare Identifiers Service, NASH, My Health Record, HealthLink/Medical-Objects, the NHSD API, the HealthPathways API, myID, app store accounts — will be built against a clean, well-documented interface with a **mock implementation behind it**, clearly labelled as a mock, so the real integration is a matter of swapping the implementation once the real credentials exist, not rearchitecting anything.

**What I genuinely cannot build tonight, no matter how long I run: a live, government-connected, regulator-approved production health platform.** Not because of engineering effort — because several of the actual prerequisites are things only you (or a legal entity you control) can do, and they were already identified across this project's own docs as needing a human:

| Blocker | Where it's already flagged | Who has to do it |
|---|---|---|
| A registered business entity to hold contracts, insurance, and regulator relationships | Throughout | You |
| A cloud provider account with real billing | tech stack doc | You |
| A registered domain | — | You |
| Healthcare Identifiers Service registration (the platform's own HPI-O) | `adha-regulator-questions-todo.md` | You, via ADHA |
| NASH organisation certificate | `adha-regulator-questions-todo.md` | You, via ADHA |
| My Health Record conformance testing | `adha-regulator-questions-todo.md` | You, via ADHA |
| At least one secure messaging vendor agreement (HealthLink/Medical-Objects) | `business-case-competition.md` | You, via the vendor |
| PHN pilot partnership | `onboarding-processes.md` | You |
| HealthPathways Pathway Link API access | `adha-regulator-questions-todo.md` | You |
| Medical defence organisation conversations (Avant/MDA National/MIGA) | `cost-insurance-traceability.md` | You |
| Technology E&O / cyber liability insurance | `cost-insurance-traceability.md` | You |
| Source code/data escrow arrangement | `complaints-continuity-deceased.md` | You |
| Apple/Google developer accounts to actually publish the mobile app | this doc | You |
| A Privacy Impact Assessment and legal Terms of Service | `cost-insurance-traceability.md` | You, with a lawyer |

None of this is a criticism of the ask — it's the same list Section by section of this project has already been building toward, and it's genuinely not something an agent can shortcut by working overnight instead of during the day. **What tonight's build does is remove every other excuse for delay** — by morning, the entire engineering side of "what would we actually build" stops being a question, and the only remaining work is this list, which is fundamentally about you, conversations, and signatures, not code.

## What actually gets built, in priority order

Scoped so that if the run stops at any point — token budget, session limits, an unexpected blocker — what exists is a coherent, working slice, not eighteen half-finished stubs:

1. **Monorepo scaffold**: shared TypeScript types, the UI component library implementing today's design system, Docker Compose for full local orchestration, Terraform skeleton (structure and modules defined, not applied against a real cloud account since none exists yet), CI pipeline definition.
2. **The identity/referral backbone**: Identity & Access (Keycloak, configured, including Google/Microsoft social login as a secondary linked sign-in method — never a substitute for identity verification), Onboarding & Account (all three onboarding flows: patient/carer, GP practice, specialist — Justice Dept/social-services onboarding is explicitly Phase 2 and out of scope for tonight, since it's designed to be human-reviewed, not self-service), GP Authorisation, Consent & Security, and the Audit Log Service (immudb, wired for real, with NASH signing behind a mock signer) — this is the spine everything else hangs off, so it goes first and gets the most care. OTP delivery for account activation runs on real email sending (6-digit code) rather than SMS, since there's no paid SMS account — see `modules-and-requirements.md` for the reasoning; the interface is provider-agnostic so real SMS drops in later without touching the onboarding logic itself.
3. **Referral Service, Compliance Rules Engine, Directory Service, Secure Messaging Gateway (mocked vendor), Booking Service.**
4. **Specialist Review Service, Follow-up & Recall Service, Notification Service (mocked SMS/push/email providers, real internal logic).**
5. **Integration & FHIR Gateway** — HAPI FHIR genuinely wired up and doing real FHIR validation/resource handling; the HI Service/MHR/NASH *calls themselves* mocked, since those require real government credentials.
6. **The three frontends** — GP portal, specialist portal, patient app/companion web — built against the completed API layer, implementing the screens from `ui-design.md`.
7. **Admin/Ops Console.**
8. **End-to-end tests covering the golden path** (account onboarding → referral creation → routing → booking → specialist review → follow-up) running against the local Docker Compose stack, plus the unit test suites per service.
9. **A `BUILD_LOG.md` and `README.md`** documenting exactly what was built, what's mocked vs. real, how to run it locally, and — critically — an explicit, up-to-date version of the blocker table above so nothing about "what's still needed from you" gets lost between tonight's work and your reading of it in the morning.

## How I'll actually run this, and how I'll manage tokens

I'll execute this as a background multi-agent **Workflow** run rather than working through it turn-by-turn in this conversation — that's the right mechanism for something this long: it runs unattended, reports back when phases complete, and checkpoints properly rather than depending on this single conversation staying open all night. I'm flagging that choice here explicitly as part of the plan, since it's a meaningful decision — say so in your review if you'd rather I ran it a different way.

On tokens specifically, since you raised it: unit and integration tests are cheap (they're just running code, not spending model tokens) and I'll lean on them heavily for verification. What actually burns tokens is a model iterating on a fix-test-fail loop — so I'll cap retries per issue (a small fixed number, not an open-ended loop), and if something is genuinely stuck — a mock behaving unexpectedly, a design ambiguity the docs don't resolve — I'll make a reasonable documented judgment call and move on, logging it in `BUILD_LOG.md` for your review, rather than burning an unbounded amount of budget trying to resolve it perfectly unattended.

## What "running the build" actually means, mechanically

Worth being concrete about this rather than leaving it vague. I'm not a wrapper that shells out to a separate program called "Claude Code" — I already am an agentic coding assistant, right here, with a full Linux workspace, a shell, git, Node, Python, and every file tool I've been using all conversation to write and edit these docs. When you say "start the build," what happens is:

1. I kick off a **Workflow** run (the background multi-agent orchestration tool) using the priority order above as its phase structure. Each phase spawns one or more sub-agents — each one is functionally the same kind of coding agent I am, working from the specs already written in this project — to write code, run it, test it, and commit it to a git repository inside this same cloud workspace.
2. This runs in the background, not blocking our conversation — you can check in, close the app, whatever — and reports back with progress as phases complete, the same mechanism behind everything I've built tonight.
3. **Where the code actually lives:** in a git repository in this sandboxed cloud workspace. By morning I'll package it and deliver it to you directly (zipped, via file delivery) so you have it regardless of what happens to this session afterward. **If you'd rather it land in a GitHub repo you control**, create an empty one and give me its URL and a push-capable token when you say "start the build" — I won't create external accounts or repos on your behalf (that's one of the boundaries from the top of this doc), but pushing to a repo you've already created is a normal, safe git operation. Absent that, delivery-as-a-zip is the default and nothing is lost either way.

## What you'll actually wake up to

A working local build — clone the repo, `docker compose up`, walk through the golden path yourself — of every module in this design, built to the standards in the tech stack and requirements docs, with every real-world government/vendor integration cleanly mocked and clearly labelled. Not a demo in the sense of being fake or thin — genuinely enterprise-grade code, tested, observable, and ready to harden — but also not, and never claimed to be, a live system connected to real patients, real Medicare data, or real government infrastructure. That last part only becomes true once the blocker table above is worked through, and no amount of overnight engineering changes that.

If this scope matches what you actually want, say so and I'll start the Workflow run. If you want the scope narrowed (e.g. just the backbone in step 2, or just one full vertical slice through the UI) or widened, tell me that in the review instead — better to fix the target now than discover the mismatch in the morning.
