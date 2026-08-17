# Test results

Two tiers:

| Tier | Command | Needs | Result |
| --- | --- | --- | --- |
| Unit / in-process | `npm run test --workspaces` | nothing running | **585 tests, 0 failed** |
| Integration (live stack) | `npm run test:integration` | docker-compose stack up | **14 tests, 0 failed** |
| Static validators | `npm run validate` | nothing running | realm + outbox schema OK |

The integration tier is new and exists because every serious bug found on 2026-08-17
was invisible to the 577 unit tests that were green throughout — each lived in a seam
between components. See [`integration/README.md`](integration/README.md), including
proof that the suite fails when a regression is reintroduced.


Last run: **2026-08-17 22:49** — `npm run test --workspaces --if-present`

**113 suites / 577 tests, 0 failed.** Exit code 0 under both `TZ=Australia/Sydney` and `TZ=UTC` (identical results in each).

Run in both timezones deliberately: booking previously had tests that only passed where they were written. See TODO 13.

| Workspace | Suites | Tests | Status |
| --- | --- | --- | --- |
| `admin-console-service` | 6/6 | 28/28 | pass |
| `audit-client` | 1/1 | 7/7 | pass |
| `audit-log-service` | 7/7 | 25/25 | pass |
| `audit-outbox` | 1/1 | 7/7 | pass |
| `auth-client` | 1/1 | 2/2 | pass |
| `booking-service` | 8/8 | 42/42 | pass |
| `consent-security-service` | 9/9 | 42/42 | pass |
| `directory-service` | 10/10 | 47/47 | pass |
| `followup-recall-service` | 11/11 | 45/45 | pass |
| `gp-authorisation-service` | 5/5 | 26/26 | pass |
| `gp-portal` | 4/4 | 24/24 | pass |
| `identity-access-service` | 8/8 | 36/36 | pass |
| `notification-service` | 8/8 | 38/38 | pass |
| `onboarding-account-service` | 13/13 | 70/70 | pass |
| `patient-mobile` | 5/5 | 29/29 | pass |
| `patient-web` | 4/4 | 24/24 | pass |
| `referral-service` | 3/3 | 31/31 | pass |
| `shared-types` | — | — | no test script / no tests |
| `specialist-portal` | 5/5 | 20/20 | pass |
| `specialist-review-service` | 3/3 | 32/32 | pass |
| `ui-components` | 1/1 | 2/2 | pass |

## How to reproduce this

The suite **cannot** be run from inside a service image — each installs only its own
dependency subset (the COPY-package-json-first caching pattern), so other services'
dependencies are absent and roughly 25 suites fail misleadingly. Run it on the host,
and only after these three steps:

```bash
rm -rf packages/*/dist packages/*/tsconfig.tsbuildinfo   # stale tsbuildinfo => partial dist
npm install                                              # links workspace packages
npm run build -w packages/shared-types -w packages/audit-client \
              -w packages/auth-client -w packages/audit-outbox -w packages/ui-components
npm run prisma:generate --workspaces --if-present         # else PrismaService lacks models
npm run test --workspaces --if-present
```

Skipping the package build gives `Cannot find module '@referralplatform/...'` (packages
resolve via `main: dist/index.js`). Skipping `prisma:generate` gives
`Property 'auditOutbox' is missing in type 'PrismaService'` and untyped `$transaction`.

## Not covered by this suite

- **Playwright golden path** (`e2e/`) — has never been run. TODO 10.
- **`mvn clean verify`** for `fhir-gateway` — the service builds and boots via Docker,
  but its Java test suite has not been run here.
- **Any browser/UI behaviour.** These are unit/integration tests only; the three web
  apps have unit tests but no rendered-page or real-login coverage.
- **Cross-service integration over real HTTP** — exercised by hand during the golden
  path, not automated.

