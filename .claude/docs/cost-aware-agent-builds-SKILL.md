---
name: cost-aware-agent-builds
description: Use this skill before launching any multi-agent build — a background Workflow run, a large unattended code-generation task, an overnight "build the whole thing" request, or any fan-out of many parallel coding agents. Also use it when a user asks how to control token/credit spend on agentic builds, or references a past build that cost more than expected. Triggers include "build this", "start the build", "run this overnight", "use a workflow to build X", multi-service/multi-file scaffold requests, and explicit "keep costs down" instructions.
license: none — freely shareable
---

# Cost-aware multi-agent builds

## Why this exists

A real build (August 2026, ReferralPlatform project): 34 parallel agents, 3,921 total turns, ~$180 in API-equivalent usage. 73% of that was agents re-reading their own accumulated conversation on every single turn — not new thinking, not new output (actual generated code/text was ~1% of the spend). Worse: the sandbox that ran it had no real network access to the package registries the code depended on (Maven Central, Docker Hub, a Prisma binary host), so a meaningful share of the "verification" spend — typecheck/lint/test loops — could never produce more than partial confidence, because the underlying `docker compose up` / `mvn clean verify` was structurally impossible to run there. That specific, checkable fact could have been discovered for a few dollars with one small pilot agent, before committing the other $170+ to a full fan-out. It wasn't checked first. Follow the rules below so that mistake doesn't repeat.

## Rules, in order of when they apply

1. **Pilot the environment before committing to a large fan-out.** Before spawning more than a handful of agents, run one small, cheap check that the environment can actually complete whatever verification the build depends on — can it reach the package registry, the container registry, the compiler toolchain it needs? If it can't, say so to the user explicitly and either fix it or adjust the plan (e.g. recommend a different environment) before spending real money assuming it works.

2. **Agree an explicit budget before starting.** Propose a dollar or token ceiling based on the scope of the ask, and get the user's confirmation before kicking off. If using a workflow/orchestration tool that supports a budget parameter, use it to actually enforce the ceiling (stop or degrade gracefully when reached) rather than letting the run go to completion regardless of cost.

3. **Scope agents to larger, cohesive units — not one agent per microservice/file.** Every additional independent agent re-pays a fixed "read the instructions, get oriented" cost. Fewer, larger-scoped agents pay that fixed cost fewer times, even though each individual agent's own conversation runs a bit longer.

4. **Bound total turns per agent, not just retries-on-failure.** Cap around 40-60 turns. Past that ceiling, the agent should stop, commit/report what it has, and hand back a documented partial rather than continuing to accumulate context trying to reach a perfect finish. A capped-retry agent that never gets "stuck" can still blow the budget just by running for a very long time.

5. **Separate writing from verifying.** Don't let one agent's context grow across an open-ended write → test → fix → retest loop. Do one clean write pass, run verification once, and route any remaining failures to a small, freshly-scoped fix-up agent whose context is just "here is the one failing thing" — not the full history of everything that agent already did.

6. **Explain the real cost driver plainly if asked.** In long agentic sessions, the dominant cost is almost always the repeated re-reading of accumulated context on every turn — this can be 70%+ of total spend — not the tokens actually generated. A handful of agents each running a very long conversation is typically far more expensive than the same work split across more, shorter conversations, even though it looks like "fewer moving parts" going in.

7. **Give a concrete pre-flight cost estimate and get explicit go-ahead before any large multi-agent fan-out — every time, not just when asked.** Treat this as standard practice for any build above a few agents, the same way you'd confirm scope before starting expensive work in any other context.
