# BUILD_LOG

**Convention: one file per service/app, named after it, added by whoever builds real
functionality into that service/app** — e.g. `BUILD_LOG/referral.md`,
`BUILD_LOG/gp-portal.md`. This scaffolding phase did not create per-service log files
yet (there's no real functionality to log beyond the skeleton itself) — the first
agent/contributor to build actual business logic into a service starts its log file.

## What goes in a service's build log

Not a duplicate of git history. Write down what a `git log` can't tell you:

- **Decisions made while building this specific service** that weren't already
  settled by `CONVENTIONS.md` or a `claude/` project doc — and why. If the decision
  is actually a new cross-cutting convention, put it in `CONVENTIONS.md` instead (or
  as well) so the next service doesn't have to rediscover it.
- **Deviations from `CONVENTIONS.md`**, if any were genuinely necessary, and why.
- **What's stubbed/mocked and what's real** — e.g. "the NHSD sync job runs against a
  fixture file, not the real NHSD API, because sandbox credentials weren't available."
- **Anything the next person touching this service should know before changing it** —
  a non-obvious dependency, a known limitation, a TODO that isn't captured as a code
  comment.
- **What was verified and how** (tests run, endpoints manually hit, a service actually
  booted and checked) — especially anything that couldn't be verified in whatever
  environment it was built in (see the scaffolding phase's own note on this in
  `README.md`, "Verified vs. not-yet-verified in this scaffold" — that's the pattern
  to follow).

Keep entries dated and short. This is a working log, not a report — bullet points
over prose.

## Consolidation

At the end of the build (once every service listed in `CONVENTIONS.md` §1 has real
functionality, not just the scaffold), consolidate every `BUILD_LOG/<name>.md` into a
single root `BUILD_LOG.md` — chronological or per-service, whichever reads better once
there's real content to organize. Don't consolidate early; per-service files avoid
merge conflicts while many contributors are building in parallel.
