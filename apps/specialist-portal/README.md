# specialist-portal

Next.js web portal for specialists and their practice staff: incoming referral queue, referral decisions, booking calendar management, Follow-up Plan creation, directory profile management.

Next.js (App Router) + TypeScript, built on `@referralplatform/ui-components` and
`@referralplatform/shared-types`. See root `CONVENTIONS.md` and `claude/ui-design.md`
(project doc) for the full screen inventory. See `BUILD_LOG/specialist-portal.md`
for the full design rationale, what's real vs. mocked, and known gaps.

## What this app is built against

Every screen calls a real backend NestJS service directly with `fetch` (no
mocked data in the app itself):

- `services/specialist-review` (port 3008) — the referral queue's AI-assisted
  extraction summary, the explicit-confirmation gate, and the eConsult/full-
  appointment decision.
- `services/referral` (port 3005) — the earlier "new referral" decline step.
- `services/booking` (port 3007) — calendar connection, open slots, bookings.
- `services/followup-recall` (port 3009) — Follow-up Plan creation/lookup.
- `services/directory` (port 3006) — self-maintained directory profile.

Sign-in is a real OIDC Authorization Code + PKCE flow (`app/lib/auth/`)
against Keycloak's `specialist-portal` public client (see
`infra/keycloak/realm-export.json`) — there is no mocked/fake login. You need
a running Keycloak (`docker compose up -d keycloak`) with a specialist user
in the `referralplatform` realm to sign in.

## Run locally

```bash
npm install            # from monorepo root
npm run dev -w apps/specialist-portal
# -> http://localhost:3101
```

Backend service URLs and the Keycloak issuer are read from `NEXT_PUBLIC_*`
env vars (see `docker-compose.yml`'s `specialist-portal:` block and
`BUILD_LOG/specialist-portal.md`'s "known gaps" for which ones that block
doesn't yet set) — every client in `app/lib/api/` falls back to that
service's documented `localhost` port if the env var is unset, so `npm run
dev` against a `docker compose up`'d backend works without extra
configuration.

## Build

```bash
npm run build -w apps/specialist-portal
npm run start -w apps/specialist-portal
```

## Test

```bash
npm run test -w apps/specialist-portal       # component unit tests (Jest + Testing Library)
```

Web end-to-end tests use Playwright (see `claude/solution-architecture-tech-stack.md`) —
not yet wired up in this skeleton; add `@playwright/test` and a `playwright.config.ts`
when the first real e2e flow is built.
