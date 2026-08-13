# patient-web

Next.js companion web app for the patient/carer's bigger-screen use cases (document history, linked-GP management). The primary patient/carer surface is the Expo mobile app in apps/patient-mobile.

Next.js (App Router) + TypeScript, built on `@referralplatform/ui-components` and
`@referralplatform/shared-types`. See root `CONVENTIONS.md` and `claude/ui-design.md`
(project doc) for the full screen inventory — implemented in this build; see
`BUILD_LOG/patient-app.md` for the full write-up of what's real vs. mocked. Screens:
onboarding activation, home dashboard, GP-approval requests, referral list/detail with
secure message thread, booking preference capture, consent & security, raise a
concern, document vault.

## Run locally

```bash
npm install            # from monorepo root
npm run dev -w apps/patient-web
# -> http://localhost:3102
```

## Build

```bash
npm run build -w apps/patient-web
npm run start -w apps/patient-web
```

## Test

```bash
npm run test -w apps/patient-web       # component unit tests (Jest + Testing Library)
```

Web end-to-end tests use Playwright (see `claude/solution-architecture-tech-stack.md`) —
not yet wired up in this skeleton; add `@playwright/test` and a `playwright.config.ts`
when the first real e2e flow is built.
