# BUILD_LOG: specialist-portal

2026-08-13 — initial real implementation (previously scaffold-only). Next.js
(App Router) + TypeScript web portal per `claude/ui-design.md`'s Specialist
portal screen inventory (screens #1–#5), built on `@referralplatform/ui-components`
and `@referralplatform/shared-types`, calling five real backend services
directly with `fetch` — no mocked data inside this app itself.

## What was built

### 1. Real OIDC sign-in — `app/lib/auth/`

`pkce.ts` (PKCE S256 code-verifier/challenge, Web Crypto API) + `oidc.ts`
(Authorization Code flow against Keycloak's `specialist-portal` public
client — see `infra/keycloak/realm-export.json`: `publicClient: true`,
`directAccessGrantsEnabled: false`, PKCE S256 enforced) + `AuthContext.tsx`
(React context: loads/refreshes tokens from `sessionStorage` on mount,
decodes the JWT payload client-side for display only — real verification
happens server-side on every request via `packages/auth-client`'s
`TokenVerifier`, per root CONVENTIONS.md §8).

This is a genuinely working Authorization Code + PKCE implementation (not a
stub) — `app/login` redirects to Keycloak's real `/protocol/openid-connect/auth`
endpoint, `app/callback` exchanges the code for tokens against the real
`/protocol/openid-connect/token` endpoint. It hasn't been exercised against
a *running* Keycloak in this sandbox (no Docker daemon here — see "What's
verified" below), but the request/response shapes match Keycloak's
documented OIDC endpoints exactly, and `pkce.test.tsx` verifies the S256
challenge computation against the literal example vectors from RFC 7636
Appendix B, so the crypto is independently proven correct.

### 2. API clients — `app/lib/api/`

One typed client module per backend service this app calls, each a thin
wrapper over the shared `apiFetch` (`http.ts`) that attaches
`Authorization: Bearer <token>` and maps NestJS's `class-validator` error
shape (`{ message: string | string[] }`) into a typed `ApiError`:

- `specialistReviewApi.ts` — `services/specialist-review` (port 3008): the
  `ReferralCase`/`ExtractionResult`/`SpecialistDecision`/
  `PathologyImagingRequest` types are hand-mirrored from that service's own
  `prisma/schema.prisma` (it has no npm package to import types from — only
  cross-service domain objects live in `@referralplatform/shared-types` per
  root CONVENTIONS.md §4).
- `referralApi.ts` — `services/referral` (port 3005): `Referral` type from
  `@referralplatform/shared-types` directly.
- `bookingApi.ts` — `services/booking` (port 3007): `Booking` from
  shared-types, `CalendarConnection`/`Slot` hand-mirrored (same reasoning).
- `directoryApi.ts` — `services/directory` (port 3006): `DirectoryEntry` from
  shared-types.
- `followupApi.ts` — `services/followup-recall` (port 3009):
  `FollowUpReferralType`/`FollowUpPlan` hand-mirrored — that service's own
  `FollowUpReferralType` vocabulary isn't in shared-types either (see
  `BUILD_LOG/followup-recall.md`'s judgment call #2 — this app just mirrors
  the same gap, doesn't try to work around it).

### 3. Screens — one per `claude/ui-design.md` Specialist portal inventory item

- **`app/queue`** (screen #1, incoming referral queue) — two sections,
  deliberately not merged (see the "Two-service seam" design note below):
  "New referrals" (`services/referral`, status `routed`) and "In review"
  (`services/specialist-review` `ReferralCase`s). Each in-review case shows
  its latest AI-assisted extraction summary inline, first, per ui-design.md
  — the full referral letter is one click deeper (`app/queue/[caseId]`).
- **`app/queue/referral/[referralId]`** — the new-referral decision:
  decline-with-reason only (see design note below for why there's no
  "accept" button here).
- **`app/queue/[caseId]`** (screen #2, referral decision) — the AI-assisted
  extraction summary (structured fields rendered first, full letter behind
  a toggle), re-run extraction, the explicit-confirmation gate (confirm/
  reject — confirm requires the literal `{confirmed: true}` the backend
  enforces), the branch decision ("Accept — proceed to full appointment" /
  "Respond with advice (eConsult)" with a required advice textarea), pre-visit
  pathology/imaging requests, case completion, and case cancellation.
- **`app/bookings`** + **`app/bookings/[bookingId]`** (screen #3, booking
  calendar management) — calendar connect/sync status, open slots, the
  bookings list with cancel.
- **`app/followup-plans/new`** + **`app/followup-plans`** (screen #4,
  Follow-up Plan creation) — the structured form (referral type, next
  review date, required tests, indefinite-referral flag), pre-filled from
  `?referralId=&patientId=&gpId=` query params when linked from a case's
  "Create Follow-up Plan" button.
- **`app/profile`** (screen #5, directory profile management) — load an
  existing self-registered profile by HPI-I (client-side workaround, see
  `directoryApi.ts`'s `findMyProfileByHpiI` doc comment: the search endpoint
  has no `hpiI` filter param), edit, and save via `PUT /directory/entries/self`.

Every screen is wrapped in `RequireAuth` (a UX convenience — the real
enforcement is server-side `BearerAuthGuard` on every endpoint) and uses
`StatusPill` (`app/components/StatusPill.tsx`) to render every status value
this app touches (`Referral`/`ReferralCase`/`Booking`/`FollowUpPlan`) with a
paired icon + text label, never colour alone, per ui-design.md's
accessibility principle.

## Key design decision: the two-service seam in the referral queue

`claude/ui-design.md` describes one screen: "Referral decision — accept /
respond with advice (eConsult) / decline-with-reason." The real backend has
**two** services with two different state machines covering different parts
of a referral's life:

- `services/referral`'s own state machine (`routed -> booked | declined |
  cancelled`) only allows **decline** at the `routed` stage — there is no
  "accept" transition (accepting is implicit: the patient/GP just proceeds
  to book), and no "respond with advice" transition until *after* booking
  (`resolveEconsult` requires `in_review`, reachable only via `booked ->
  in_review`).
- `services/specialist-review`'s `ReferralCase` (created once a referral
  reaches `booked` — see its own BUILD_LOG: "the intended real caller is the
  Referral/Booking Service once a referral reaches `booked`," not yet wired
  from either side) is where the AI-assisted extraction, the
  explicit-confirmation gate, and the real eConsult-vs-full-appointment
  branch decision actually live.

Rather than paper over this with a UI that claims a backend transition that
doesn't exist, this app splits the single ui-design.md screen honestly into
two real screens matching the two real state machines (`app/queue/referral/
[referralId]` for the early decline-only decision, `app/queue/[caseId]` for
the later accept/advice decision), and documents the mapping in both files'
doc comments. `app/queue/[caseId]`'s "Cancel case" button is deliberately
*not* labelled "Decline" — `POST /cases/:id/cancel` is a different, later
transition than the Referral Service's `decline`, and this app never claims
a backend capability that isn't real.

**Recommended real fix**, out of this app's scope (it needs
`services/referral` and/or `services/booking` to actually call
`POST /cases` on the Specialist Review Service once a referral books — see
that service's own BUILD_LOG for the same gap flagged from its side): once
that integration exists, this seam could be smoothed further, but the two
screens would likely still make sense as separate decision points even
then, since they're genuinely different moments in the workflow (before vs.
after booking).

## Other judgment calls

1. **`specialistId` scoping has no real backend mapping to lean on.**
   No service in this build maps a Keycloak principal (`sub`) to a domain
   `SpecialistId` — `AuthenticatedPrincipal` carries `sub`/
   `healthcareIdentifier` but nothing exposes "look up my SpecialistId from
   my token." Defaults to the token's own `sub`; the nav bar's editable
   "Specialist id" field (`AuthContext.tsx`, persisted to `localStorage`)
   lets this app be exercised against seeded/demo data using different
   specialist ids without waiting on that cross-service mapping. Documented
   in `AuthContext.tsx`'s doc comment as a follow-up for
   `services/identity-access`, not something to silently paper over here.
2. **`GET /referrals` has no `specialistId` filter** (`ListReferralsQueryDto`
   only supports `patientId`/`gpId`/`status`) — `app/queue/page.tsx` fetches
   every `routed` referral and filters client-side on `referral.specialistId
   === specialistId`. Fine at this build's scale; a real fix is an additive
   query param on `services/referral`.
3. **`GET /directory/entries` has no `hpiI` filter** — `findMyProfileByHpiI`
   fetches a page of entries and filters in-process (see `directoryApi.ts`'s
   doc comment). Same category of gap, same "fine for now" scale reasoning
   `BUILD_LOG/directory.md` itself uses for `state` filtering.
4. **`GET /follow-up-plans` requires a `patientId`** (no specialist-scoped
   listing endpoint exists) — `app/followup-plans` is a per-patient lookup
   screen, not a specialist-wide list, documented in that file's doc
   comment.
5. **`docker-compose.yml`'s `specialist-portal:` block sets
   `NEXT_PUBLIC_SPECIALIST_REVIEW_URL` and `NEXT_PUBLIC_BOOKING_SERVICE_URL`
   but not `NEXT_PUBLIC_REFERRAL_SERVICE_URL`, `NEXT_PUBLIC_DIRECTORY_SERVICE_URL`,
   or `NEXT_PUBLIC_FOLLOWUP_RECALL_URL`** — out of this app's scope to edit
   that root-level file. Every API client falls back to that service's own
   documented `localhost` port (3005/3006/3009 respectively) when the env
   var is unset, so this still works once those lines are added — same
   pattern several backend services' BUILD_LOGs already used for their own
   missing `docker-compose.yml` env vars.
6. **The OIDC callback does a full `window.location.assign('/')` rather than
   a client-side router navigation** after exchanging the code — deliberate:
   `AuthProvider` only loads tokens from `sessionStorage` on mount, and a
   client-side navigation wouldn't remount it. Documented in
   `app/callback/page.tsx`'s doc comment.
7. **No refresh-token rotation UI/retry-on-401 interceptor** — `AuthContext`
   refreshes an expiring token on mount (and only on mount), not
   proactively mid-session or transparently on a 401 from an API call. A
   real production build would want a fetch interceptor that refreshes and
   retries once on 401; out of scope for this pass, not silently assumed
   away.

## What's mocked

Nothing in this app directly — it has no external-system dependency of its
own. It calls backend services that themselves mock external systems
(NHSD, HealthPathways, secure-messaging vendors, calendar providers,
pathology/My Health Record, LLM extraction) — see those services' own
BUILD_LOGs. The one place this matters for the specialist portal's own UX:
`app/bookings`'s copy explicitly tells the user calendar sync is a MOCK
provider (`services/booking/src/calendar/mock-calendar.client.ts`), so
nobody mistakes the simulated availability for a real Google/Outlook/CalDAV
connection.

## What's incomplete / known gaps

- Every gap listed under "Other judgment calls" above.
- No Playwright e2e tests yet — per root CONVENTIONS.md §11, "not yet wired
  into this scaffold; add `@playwright/test`... when the first real user
  flow... exists to test end-to-end," which is now true of this app. Left
  as a real follow-up rather than added speculatively in this pass, to keep
  this contribution scoped to the app itself.
- No offline/optimistic UI, no toast/notification system for background
  errors — every mutation shows its error inline on the same screen.
- The audit trail for every clinical/consent-relevant write happens
  server-side in the backend services this app calls (each via the outbox
  pattern, per root CONVENTIONS.md §7) — this app makes no direct audit
  writes of its own, which is correct: it's a pure API-calling frontend
  with no database of its own.

## What was verified

- `npm run test -w apps/specialist-portal` — **20/20 unit tests pass**
  across 5 suites:
  - `pkce.test.tsx` — code-verifier shape/uniqueness, and the S256 code
    challenge computation checked against the **literal RFC 7636 Appendix B
    example vectors** (not just internal self-consistency), determinism,
    and no base64 padding/unsafe characters in the output.
  - `oidc.test.tsx` — `decodeJwtPayload` against hand-built fake JWTs:
    claim extraction (`sub`/`principal_type`/`healthcare_identifier`/
    `preferred_username`), realm+client role flattening, the specialist
    default when `principal_type` is absent, and graceful `null` on a
    malformed token.
  - `http.test.tsx` — the shared API client: Authorization header
    attached/omitted correctly, JSON body serialisation, query-string
    building (including omitting `undefined`/empty values), `ApiError`
    thrown with the right status/message from a NestJS-shaped error body,
    array `message` joined into one string, empty response body handled.
  - `StatusPill.test.tsx` — human-readable label mapping, including the
    "never colour alone" accessibility property (every pill exposes a text
    label via `role="status"`) and the humanized fallback for an unmapped
    status.
  - `page.test.tsx` (updated from the scaffold) — the home page correctly
    gates behind "Sign in required" with no session.
  - jsdom (this build's pinned `jest-environment-jsdom@29`, via a `jsdom@20`
    resolution) has no global `SubtleCrypto`/`TextEncoder`/`Response` —
    `pkce.test.tsx` polyfills `crypto`/`TextEncoder` from Node's own
    `crypto`/`util` modules before importing the module under test;
    `http.test.tsx` avoids the gap entirely by mocking the minimal
    `Response`-shaped object `apiFetch` actually touches
    (`.ok`/`.status`/`.statusText`/`.text()`) rather than polyfilling a full
    `Response` constructor.
- `npm run lint -w apps/specialist-portal` — clean, 0 warnings.
- `npm run typecheck -w apps/specialist-portal` — clean, 0 errors.
- `npm run build -w apps/specialist-portal` — **succeeds**, all 12 routes
  compile (including both dynamic `[caseId]`/`[bookingId]`/`[referralId]`
  routes and the `useSearchParams()`-using `/callback` and
  `/followup-plans/new` pages, correctly wrapped in `React.Suspense` per
  Next.js 16's build-time requirement).
- `npx prettier --check` — clean after one `--write` pass (formatting only,
  no logic changes).
- **Not verified**: an actual sign-in round trip against a running Keycloak,
  or any screen against a live backend service — no Docker daemon in this
  sandbox (the same constraint every backend service's BUILD_LOG in this
  build already documents). The request/response shapes were checked
  directly against each backend service's real controller/DTO source (not
  guessed) — see the "What was built" section above for exactly which files
  were read for each client.

## How to run/test this app in isolation

```bash
# From the monorepo root:
npm install
npm run build -w packages/shared-types -w packages/ui-components   # workspace deps this app imports

npm run test -w apps/specialist-portal        # unit tests — no external infra needed
npm run lint -w apps/specialist-portal
npm run typecheck -w apps/specialist-portal
npm run build -w apps/specialist-portal       # production build

# Full local stack (needs Docker):
docker compose up -d postgres redis keycloak referral specialist-review booking directory followup-recall
npm run dev -w apps/specialist-portal
# -> http://localhost:3101 — click "Sign in" to exercise the real Keycloak OIDC flow
```
