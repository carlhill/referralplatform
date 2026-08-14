# ReferralPlatform golden-path e2e test

Playwright suite covering the platform's golden path end-to-end:

> GP creates a referral in the GP Portal → it routes through the Directory
> Service (HealthPathways specialist-type suggestion + directory search) and
> the Booking Service → the specialist sees it in the Specialist Portal → the
> patient sees the referral and a booking outcome in Patient Web.

Every step is a real HTTP call against a real, unmodified backend endpoint —
either driven through the actual UI (Playwright clicking/typing into the real
Next.js apps) or, for the handful of setup steps no portal screen currently
exposes, a direct `request.post/put/get` call against the real service API
using a real, Keycloak-signed bearer token. Nothing is mocked by this test
suite beyond what each service's own `BUILD_LOG/<service>.md` already
documents that service mocking internally (NHSD Directory, HealthPathways,
SMS, etc. — see root `BUILD_LOG/*.md`).

## Prerequisites

1. The full stack running via the root `docker-compose.yml`:
   ```bash
   cd .. && docker compose up -d --build
   ```
   This requires a network policy that allows pulling images from Docker Hub
   / quay.io and reaching `binaries.prisma.sh` (for each service's
   `prisma generate` build step) — **neither was reachable in the sandbox
   this suite was written and last run in** (see the root integration
   report / `docker-compose.yml`'s own comments for the exact 403s hit).
   This suite has therefore been written and reasoned through carefully
   against the real application code, but **has not been executed against a
   live stack**. Treat first real runs as you would any new test: expect to
   fix a locator or two against the actual rendered DOM.
2. `infra/keycloak/realm-export.json` imported (the compose `keycloak`
   service does this automatically via `--import-realm`) — this must be the
   *updated* realm export from this same integration pass, which adds:
   - `directAccessGrantsEnabled: true` on the `gp-portal`, `specialist-portal`,
     and `patient-web` clients (see "Why ROPC" below);
   - a `principal_type` protocol mapper on those same three clients (maps the
     `principal_type` user attribute onto the token — without this,
     every backend `requireRole`-style check sees `principalType: 'system'`
     and rejects everything, since no mapper existed before this pass);
   - three fixed test users: `gp.test`, `specialist.test`, `patient.test`
     (password `TestPassword123!`, see the realm file's
     `_e2eTestUserComment` entries). **Local/dev-realm-only** — never
     replicate this pattern (fixed passwords, direct grant, no MFA) in a
     realm that isn't purely local development.
3. From this directory:
   ```bash
   npm install
   npx playwright install --with-deps chromium
   ```

## Running

```bash
npm test            # headless
npm run test:headed # watch it drive the three apps
npm run report       # open the last HTML report
```

## Why ROPC and not the real login UI

`gp-portal` and `specialist-portal` are bound to the realm's `clinician-browser`
authentication flow, which makes WebAuthn/passkey **mandatory** (no password
fallback at all — see `infra/keycloak/realm-export.json`'s
`clinician-browser Forms` flow and `identity-security-recommendations.md`
§6). Driving that for real in Playwright is possible in principle (Chromium's
CDP `WebAuthn.addVirtualAuthenticator` API), but stacks a first-time
passkey-registration ceremony inside Keycloak's hosted login page on top of
the OAuth redirect flow — real, but intricate, unverifiable-blind engineering
this pass didn't have a live Keycloak to iterate against (see "Known
limitations" below). Patient/carer login does support password (+ optional
OTP), so a real UI login is *more* tractable there, but was kept consistent
with the other two personas for one simpler, uniform test setup path.

Instead this suite fetches a real access token per persona via Keycloak's
**Direct Access Grant** (Resource Owner Password Credentials) — a separate,
un-overridden flow binding (only the `browser` flow binding is overridden to
mandate WebAuthn; `directGrant` still uses the realm's built-in
username+password flow) — and seeds it into the target app's `sessionStorage`
under the exact key/shape its own OIDC client code expects
(`rp_gp_portal_tokens` / `rp_specialist_portal_tokens` / `rp_patient_web_tokens`
— see each app's `lib/auth/oidc*.ts`), via `context.addInitScript` so it's
present before the app's `AuthContext` mounts. The token itself is completely
real: signed by the real Keycloak instance, and verified by every backend
service exactly the same way a browser-obtained token would be — this
exercises 100% real backend authorization, just without also re-testing
Keycloak's own login page rendering (which isn't this platform's code).

## Why a specialist self-registers first

The GP Portal's "create a referral" screen has **no free-text specialist-id
field** — the only way to assign a specialist is via the HealthPathways
suggestion panel's "matching specialists in the directory" dropdown, which is
populated from a real `GET /directory/entries?subspecialty=...` search. So
this test's specialist first calls the real, working
`PUT /directory/entries/self` self-registration endpoint (exercising
`apps/specialist-portal`'s own "Directory profile" feature, via a direct API
call rather than driving that form too, to keep the suite's runtime
reasonable) with `subspecialty: "Cardiology"`, and the referral's reason text
is deliberately chosen ("chest pain and palpitations...") to keyword-match
the same category in
`services/directory/src/directory/healthpathways/static-pathway-links.ts`.

**Known, real gap this surfaced**: no endpoint in this build ever sets a
`DirectoryEntry.specialistId` to a real Keycloak-authenticated specialist's
own `sub`. `services/onboarding-account`'s `DirectoryClient` calls
`POST /directory-entries` to do exactly that, but `services/directory` has no
such route (`BUILD_LOG/onboarding-account.md` and `BUILD_LOG/directory.md`
both flag this from their own sides). `PUT /directory/entries/self` — the
only endpoint that *does* exist — never sets `specialistId` either
(`services/directory/src/directory/directory.controller.ts`'s own doc comment:
*"a real deployment would additionally restrict this to `principalType ===
'specialist'` matching the token's own `hpiI` ... left as a documented
follow-up since `AuthenticatedPrincipal` doesn't carry an `hpiI` claim yet"*).
So a referral's `specialistId` ends up being the *directory entry's own row
id*, not the specialist's Keycloak `sub` — and this test uses the Specialist
Portal's own real, documented escape hatch for exactly this
("Specialist id:" editable in the nav bar — see
`apps/specialist-portal/app/lib/auth/AuthContext.tsx`'s doc comment: *"lets
this app be exercised against seeded/demo data ... without waiting on that
cross-service mapping to be built"*) to scope the logged-in specialist to
that same id. **A real deployment needs that mapping built** before a
specialist's own login can ever show them their own referrals without this
manual step — flagged clearly in the root integration report, not silently
worked around.

## Known gap this test works around: nothing calls `POST /cases`

`BUILD_LOG/specialist-review.md`: *"Nothing in this build actually calls
`POST /cases`. The Referral Service (and/or Booking Service) is the intended
real caller once a referral reaches `booked`, but wiring that call is outside
[either service]'s task scope."* This test does **not** work around that gap
by calling `POST /cases` itself — doing so wasn't necessary, because the
Specialist Portal's queue page has a second, independent, already-fully-wired
section ("New referrals") that reads directly from
`GET /referrals?status=routed` and filters by `specialistId` client-side, with
no dependency on a `ReferralCase` ever existing. This test asserts the
specialist sees the referral via that real, working path. The "In review"
section (AI-assisted extraction, explicit-confirmation gate, etc.) genuinely
cannot be exercised end-to-end from a referral today without either building
that missing service call or manually calling `POST /cases` as a stand-in —
this suite deliberately doesn't paper over that by calling it directly, so
the gap stays visible rather than silently fixed by a test.

## Known limitations

- **Not executed against a live stack** — see "Prerequisites" above. Written
  and reasoned through against the real, current application source
  (selectors, DText shapes, and API contracts were all read from the actual
  `apps/*` and `services/*` source, not guessed), and one real service
  (`directory`) was booted locally in the writing sandbox against local
  Postgres/Redis to confirm the wiring pattern this pass relies on generally
  works — but the full three-app, nine-service chain has not been run
  first-to-last. Expect to need a locator tweak or two on first real run.
- **No seeded specialist calendar/slots** — the booking step asserts on
  whichever real outcome comes back (`waitlisted` is the expected one, since
  no `Slot` rows exist for a brand-new directory entry with no calendar
  connection), not a confirmed appointment time.
- **`patient-mobile` (Expo) is out of scope** for this suite — it has no
  meaningful production Docker image (see `docker-compose.yml`'s comment on
  that service) and shares the same `lib/api` client code path as
  `patient-web`, which this suite does cover.
