# BUILD_LOG: gp-portal

2026-08-13 — verified/completed real implementation. Next.js 16 (App Router) +
TypeScript web portal per `claude/ui-design.md`'s GP Web Portal screen inventory,
built on `@referralplatform/ui-components` and `@referralplatform/shared-types`,
calling eight real backend services directly with `fetch` — no mocked data inside
this app itself. The app already existed in near-complete form in this workspace
when this build session started (no prior `BUILD_LOG/gp-portal.md` had been
written yet); this session's work was to read every screen and lib module against
CONVENTIONS.md and the real backend controllers, verify typecheck/lint/test/build
all pass end to end, confirm every frontend API call matches an actual backend
route (not an assumed one), and write this log.

## What was built

### 1. Real OIDC sign-in — `lib/auth/`

`pkce.ts` (S256 code-verifier/challenge via Web Crypto) + `oidc-client.ts`
(Authorization Code + PKCE against Keycloak's `gp-portal` public client) +
`AuthContext.tsx` (React context: loads tokens from `sessionStorage`, decodes the
JWT client-side for display only, schedules a proactive refresh 60s before expiry,
falls back to `refresh_token` grant on reload if the access token has expired).
`/login` and `/callback` drive the redirect and code-exchange; `useRequireGp.ts`
is the guard every protected page calls — it redirects to sign-in when
unauthenticated, but for a wrong-principal-type token (e.g. a patient or
specialist token) it deliberately does **not** silently redirect: the home page
renders an explicit "wrong account type" card instead, since a silent bounce
would be confusing on a GP-only portal. Real enforcement of both authentication
and passkey/AAL2 step-up is server-side (Keycloak's bound "clinician-browser" auth
flow + each backend service's `packages/auth-client` guard, per CONVENTIONS.md
§8) — this app's client-side checks are UX only, never the security boundary.

### 2. API clients — `lib/api/`

One typed client module per backend service this app calls, all built on a
shared `apiFetch` wrapper (`http.ts`) that attaches `Authorization: Bearer <token>`,
maps NestJS's `class-validator` error shape into a typed `ApiError` (surfaced via
`ErrorState` with a retry action, never swallowed), and throws a clear
"could not reach `<service>` — is it running?" error when `fetch` itself fails
(network down / wrong port), rather than a generic crash:

- `referral.ts` — `services/referral` (port 3005): create/list/get/cancel a
  referral, list + acknowledge compliance flags, evaluate the compliance-rules
  preview (`POST /compliance-rules/evaluate`).
- `directory.ts` — `services/directory` (port 3006): `GET /directory/pathway-suggestion`
  (the HealthPathways suggestion) and `GET /directory/entries` (specialist search).
- `onboarding.ts` — `services/onboarding-account` (port 3002): trigger a new
  patient account (`POST /account-activation-requests`), register/look up a GP
  practice, acknowledge the practice's compliance checklist.
- `gpAuthorisation.ts` — `services/gp-authorisation` (port 3003): request/list GP
  links, check current referral authorisation for a patient.
- `consentSecurity.ts` — `services/consent-security` (port 3004): deceased-patient
  flag create/check.
- `followUpRecall.ts` — `services/followup-recall` (port 3009): list Follow-up
  Plans for a patient, self-report test completion.
- `notification.ts` — `services/notification` (port 3010): create/list message
  threads scoped to a referral, list/post messages, mark a thread resolved.

Every route called was cross-checked against that service's actual
`@Controller`/`@Get`/`@Post` decorators in this session (not assumed from the
frontend's own wishful naming) — all match.

### 3. Screens — one per `claude/ui-design.md` GP portal inventory item

- **`/`** — dashboard/quick-links, also the signed-out landing page and the
  "no practice profile yet" prompt.
- **`/patients`** — patient search & lookup: trigger a new patient account (the
  GP-triggered start of the SMS-link → OTP onboarding flow from the project's
  onboarding design) or request a GP link to a patient who already has an
  active account, with an urgent-bypass escalation path (auto-approve now,
  patient reviews retrospectively — surfaced honestly in the UI as a
  compliance-relevant action, not hidden).
- **`/referrals/new`** — referral creation: a debounced live preview of matched
  compliance-checklist rules (`ComplianceChecklistPreview`, explicitly labelled
  "decision support only, never a legal certification" per the project's
  compliance stance) as the GP flags minor/DV/complex-case indicators; a
  debounced HealthPathways specialist-type suggestion
  (`HealthPathwaysSuggestion`) as the GP types the reason for referral, with
  matching directory entries selectable inline; per-referral consent-grantee
  capture; urgent fast-path flag; and post-creation compliance-flag
  acknowledgement with an optional note.
- **`/referrals`** — practice-wide referral dashboard: filter by GP id/patient
  id/status, CSV export, status badges (colour + text label, never colour
  alone).
- **`/referrals/[id]`** — referral detail: full record, cancel-with-reason,
  compliance-flag acknowledgement panel, and an inline secure message thread
  (start thread / send / mark resolved).
- **`/follow-up`** — follow-up & recall dashboard: due/overdue Follow-up Plans
  with urgency badges (overdue vs. courtesy-call-due vs. on-track), self-report
  test completion. See "Known gap" below for how it discovers which patients to
  show.
- **`/messages`** — message-thread inbox aggregated across every referral for
  the signed-in GP's practice, most-recently-updated first.
- **`/deceased-flag`** — deceased-patient flag workflow: check-for-existing-flag,
  an explicit first-hand-or-documented-notice confirmation checkbox gating
  submission, and clear in-UI language that this freezes the account, suppresses
  every scheduled Follow-up & Recall reminder (including already-scheduled ones),
  and starts the executor/family/coroner access-request review process — and
  that it's not reversible from this screen.
- **`/settings`** — practice registration (HPI-O, integration tier A/B/C, state),
  HPI-O verification-status badge, and compliance-checklist acknowledgement
  gating new-account-request ability.

Every screen: real loading state (`LoadingState`), real error state with retry
(`ErrorState`) rather than a silent failure or infinite spinner, and status
communicated via `StatusBadge` tone + text label together (WCAG — never colour
alone), consistent with `packages/ui-components`'s design tokens (calm clinical
blue/teal, `--rp-*` CSS custom properties from `tokens.css`).

## Key decisions / honestly-documented gaps

1. **No practice-wide "list my patients" or "which practice is this GP a member
   of" backend endpoint exists yet.** `GET /referrals` and `GET /follow-up-plans`
   both require a `patientId`/`gpId` filter, not "give me this whole practice's
   panel." Two small `localStorage`-backed helpers work around this
   transparently rather than hiding it:
   - `lib/local/practiceProfile.ts` — caches the GP's own registered/looked-up
     practice (id, HPI-O, state) in the browser so referral creation and
     GP-link requests don't have to ask for it on every screen.
   - `lib/local/knownPatients.ts` — remembers patient ids this browser has
     locally seen (created a referral for, requested an account/link for), so
     `/follow-up` can aggregate Follow-up Plans across them. Both files carry a
     doc comment explaining this is a pragmatic workaround, not a hidden
     limitation, and what a real deployment would replace it with. Flagged here
     again for whichever agent/session next touches `followup-recall`'s or
     `onboarding-account`'s controller — a real "GP practice panel" query would
     let both `localStorage` helpers be deleted.
2. **`docker-compose.yml`'s `gp-portal` service only wires
   `NEXT_PUBLIC_IDENTITY_ACCESS_URL` / `NEXT_PUBLIC_REFERRAL_SERVICE_URL` /
   `NEXT_PUBLIC_KEYCLOAK_ISSUER`**, but this app also calls
   `gp-authorisation`, `consent-security`, `directory`, `followup-recall`,
   `notification`, and `onboarding-account`. `lib/api/config.ts` falls back to
   each service's documented fixed local-dev port (CONVENTIONS.md §1) when the
   corresponding `NEXT_PUBLIC_*` var isn't set, so the app works against the
   standard local stack unmodified — but editing `docker-compose.yml` /
   `depends_on` is outside this app's scope (owned by the scaffold phase), so
   it's flagged here rather than edited. Whoever next has scaffold-level access
   should add the missing `NEXT_PUBLIC_*` env vars and services to
   `gp-portal`'s `depends_on` list in the root `docker-compose.yml`.
3. **`requestAccountActivation` (`POST /account-activation-requests`) is called
   without a bearer token.** This mirrors a documented gap in
   `services/onboarding-account`'s own controller (that route isn't yet behind
   `requireAuth` server-side) — the frontend doesn't silently work around it by
   inventing auth, it just doesn't send a token it has no server-side use for
   yet. Revisit once `onboarding-account`'s BUILD_LOG confirms that route is
   guarded.
4. **The project's own MOCK-labelled boundaries (Healthcare Identifiers Service
   HPI-O verification, SMS delivery, myID) all live in the backend services**
   this app calls, not in this app itself — this app has no direct external
   integration surface of its own to mock. `/settings` surfaces the mocked
   HPI-O verification result (`verified` / `pending` / not-verified) exactly as
   the backend returns it, with a clear warning that unverified practices are
   blocked from triggering new patient-account requests.
5. **No Playwright e2e yet** — per CONVENTIONS.md §11, web e2e is
   Playwright-based but not yet wired into this scaffold anywhere in the repo;
   this app has real component/unit tests (Jest + Testing Library) instead.

## Audit logging

This app is a browser-only Next.js frontend — it has no server-side write path
of its own and therefore never calls `@referralplatform/audit-client` directly
(that package is for services with their own Postgres write transactions, per
CONVENTIONS.md §7's outbox pattern). Every clinical/consent-relevant write this
app triggers (referral creation, compliance-flag acknowledgement, deceased-flag
creation, GP-link request, message send) is a `fetch` to a backend service
(`referral`, `consent-security`, `gp-authorisation`, `notification`) that is
itself responsible for writing its own audit-outbox row in the same DB
transaction as the domain write. This app's job is only to call the right
endpoint with the right payload and surface the result — verified above against
each service's real controllers.

## What's verified vs. not

**Verified in this session** (all from the monorepo root):
- `npm run typecheck -w apps/gp-portal` — clean, no errors.
- `npm run lint -w apps/gp-portal` — clean, zero warnings (`--max-warnings=0`).
- `npm run test -w apps/gp-portal` — 4 suites, 24 tests, all passing (auth/JWT
  decode + expiry helpers, the `apiFetch` error-mapping wrapper, referral/
  follow-up/GP-link status-display mapping, and the signed-out home page).
- `npm run build -w apps/gp-portal` — production build succeeds; all 12 routes
  compile (`/`, `/callback`, `/deceased-flag`, `/follow-up`, `/login`,
  `/messages`, `/patients`, `/referrals`, `/referrals/[id]` (dynamic),
  `/referrals/new`, `/settings`, plus `/_not-found`).
- Every `lib/api/*` call site's path/method was cross-checked against the real
  `@Controller`/`@Get`/`@Post` route decorators in `services/referral`,
  `services/directory`, `services/consent-security`, `services/onboarding-account`,
  `services/gp-authorisation`, `services/followup-recall`, and
  `services/notification` — all match.

**Not verified in this session** (sandbox has no Docker daemon / no running
Postgres+Keycloak stack, consistent with every other service's BUILD_LOG in this
repo): an actual end-to-end run against a live `docker compose up` stack —
sign-in through Keycloak, referral creation hitting a live `referral` service
backed by real Postgres, etc. The request/response shapes match each service's
documented contract exactly, and the unit tests independently prove the
client-side logic (JWT parsing, PKCE, error mapping, status display), but a real
integration run is the next thing to do once Docker/Postgres/Keycloak are
reachable.

## How to run this locally

```bash
npm install                    # from monorepo root — never `cd` and install locally
cp apps/gp-portal/.env.example apps/gp-portal/.env.local   # only if your local
                                                              # service ports differ
npm run dev -w apps/gp-portal
# -> http://localhost:3100
```

Needs `identity-access`, `onboarding-account`, `gp-authorisation`,
`consent-security`, `referral`, `directory`, `followup-recall`, and
`notification` running (see root `docker-compose.yml` — noting gap #2 above),
plus Keycloak with `infra/keycloak/realm-export.json` imported.

```bash
npm run build -w apps/gp-portal      # production build
npm run typecheck -w apps/gp-portal
npm run lint -w apps/gp-portal
npm run test -w apps/gp-portal       # Jest + Testing Library
```
