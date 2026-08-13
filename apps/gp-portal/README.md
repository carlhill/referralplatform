# gp-portal

Next.js web portal for GPs and practice staff: patient search/lookup, referral creation, referral list/dashboard, follow-up & recall dashboard, message threads, deceased-patient flag, practice settings.

Next.js (App Router) + TypeScript, built on `@referralplatform/ui-components` and
`@referralplatform/shared-types`. See root `CONVENTIONS.md` and `claude/ui-design.md`
(project doc) for the full screen inventory this app will grow into.

## Run locally

```bash
npm install            # from monorepo root
npm run dev -w apps/gp-portal
# -> http://localhost:3100
```

## Build

```bash
npm run build -w apps/gp-portal
npm run start -w apps/gp-portal
```

## Test

```bash
npm run test -w apps/gp-portal       # component unit tests (Jest + Testing Library)
```

Web end-to-end tests use Playwright (see `claude/solution-architecture-tech-stack.md`) —
not yet wired up in this skeleton; add `@playwright/test` and a `playwright.config.ts`
when the first real e2e flow is built.
