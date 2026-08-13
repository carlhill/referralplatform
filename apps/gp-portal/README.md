# gp-portal

Next.js (App Router) + TypeScript web portal for GPs and practice staff, built on
`@referralplatform/ui-components` and `@referralplatform/shared-types`. Implements
every screen in `claude/ui-design.md`'s GP Web Portal inventory against the real
backend services built in earlier phases — see `BUILD_LOG/gp-portal.md` for what's
real, what's mocked (inherited from those services), and known gaps.

## Screens

- `/` — dashboard / quick links (also the signed-out landing page)
- `/login`, `/callback` — Keycloak Authorization Code + PKCE sign-in
- `/patients` — patient search/lookup: trigger a new patient account, or request a
  GP link to an existing account
- `/referrals/new` — referral creation: compliance-checklist preview, HealthPathways
  specialist-type suggestion, urgent flag, per-referral consent capture
- `/referrals`, `/referrals/[id]` — referral dashboard (filterable, CSV export) and
  detail (compliance-flag acknowledgement, cancel, secure message thread)
- `/follow-up` — Follow-up & recall dashboard
- `/messages` — message-thread inbox across active referrals
- `/deceased-flag` — deceased-patient flag/freeze workflow
- `/settings` — practice registration, HPI-O verification status, compliance
  checklist acknowledgement

## Run locally

```bash
npm install                    # from monorepo root
cp apps/gp-portal/.env.example apps/gp-portal/.env.local   # only if your local
                                                              # service ports differ
npm run dev -w apps/gp-portal
# -> http://localhost:3100
```

Needs `identity-access`, `onboarding-account`, `gp-authorisation`,
`consent-security`, `referral`, `directory`, `followup-recall`, and `notification`
running (see root `docker-compose.yml`), plus Keycloak with
`infra/keycloak/realm-export.json` imported (the `gp-portal` public client, PKCE,
passkey-required clinician browser flow).

## Build / test

```bash
npm run build -w apps/gp-portal
npm run typecheck -w apps/gp-portal
npm run lint -w apps/gp-portal        # lints app/, lib/, components/
npm run test -w apps/gp-portal        # Jest + Testing Library — auth/JWT helpers,
                                       # referral-status mapping, the API fetch
                                       # wrapper's error handling, and the home page
```

Web end-to-end tests use Playwright (see `claude/solution-architecture-tech-stack.md`)
— not yet wired up; add `@playwright/test` and a `playwright.config.ts` when the
first real e2e flow (sign-in → create referral → acknowledge compliance flag) is
worth automating end to end against a running stack.
