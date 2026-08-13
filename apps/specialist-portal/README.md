# specialist-portal

Next.js web portal for specialists and their practice staff: incoming referral queue, referral decisions, booking calendar management, Follow-up Plan creation, directory profile management.

Next.js (App Router) + TypeScript, built on `@referralplatform/ui-components` and
`@referralplatform/shared-types`. See root `CONVENTIONS.md` and `claude/ui-design.md`
(project doc) for the full screen inventory this app will grow into.

## Run locally

```bash
npm install            # from monorepo root
npm run dev -w apps/specialist-portal
# -> http://localhost:3101
```

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
