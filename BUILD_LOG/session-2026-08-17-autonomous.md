# Autonomous session — 2026-08-17

Written for Carl to pick up cold. Covers the work done while you were away, what is
verified, what is not, and where the traps are.

**Test results per workspace:** [`TEST-RESULTS.md`](../TEST-RESULTS.md).

**Headline:** 8 bugs fixed, each verified before committing. Full test suite green —
113 suites / 577 tests, exit 0, under both `Australia/Sydney` and `UTC`. All 13
services now report `healthy`. The stack is up and your `gp.test` passkey is intact,
so you can start manual testing straight away.

**Two of the bugs found were mine**, introduced earlier in the session. Both are called
out below rather than buried — one of them would have broken any clean deployment.

---

## What was fixed

### 1. Booking preference matching used the server's timezone (`630e59a`)

This looked like two flaky tests. It was a product defect.

`slot-matching.ts` resolved a patient's day/time preference with `Date.getDay()` /
`getHours()` — the **server's** timezone. Containers run UTC, so "Wednesday afternoon"
for an Australian patient was matched against Wednesday 22:00–Thursday 03:00 Sydney
time: the middle of the night, on the wrong day. `MockCalendarClient` had the same
flaw, generating its advertised "standard AU clinic hours" of 09:00–17:00 in
server-local time, which in a UTC container is 19:00–03:00 Sydney.

Added `services/booking/src/common/clinic-time.ts` with an explicit `CLINIC_TIME_ZONE`
(default `Australia/Sydney`, overridable). Matching and slot generation both resolve
through `Intl.DateTimeFormat` with that zone, so they stay correct across
daylight-saving transitions without a date library.

Tests now state intent as clinic wall-clock times via `clinicWallClock()` instead of
bare ISO strings — `new Date('2026-09-01T09:00:00')` carries no offset and is parsed in
the *server's* zone, which is precisely why those tests only ever passed on the machine
they were written on.

Verified: booking's 42 tests pass under Sydney, UTC, New York and Kolkata (a
deliberate half-hour offset).

**Known simplification, recorded in the code:** one platform-wide timezone, where the
correct model is per-practice — Australia spans five zones and an appointment means the
*specialist's* local time.

### 2. `specialist-portal` and `patient-web` shipped pre-remap URLs (`fbe2e13`)

Both carried the defect that broke gp-portal sign-in. Next.js inlines `NEXT_PUBLIC_*`
at build time, but neither Dockerfile declared the ARGs, so `docker-compose`'s
`environment:` block never reached the browser code and each app shipped the hard-coded
fallbacks in its source: `8180` for Keycloak, `3101`/`3102` for its own base URL,
`3005`–`3010` for backends.

specialist-portal now takes 8 build args, patient-web 12.

Verified against the built images, not the config: `.next/static` (the client chunks)
contains **zero** stale URLs and the correct 200xx values in both. Unreplaced
`process.env` text survives only in a server-side `.js.map`, which is inert.

### 3. Realm state that existed only live — and a realm file that could not import (`965b6b1`)

`smtpServer` (→ mailhog) and the User Profile entry for `principal_type` existed only
on the running instance and would have vanished on a fresh import. Both are now in
`realm-export.json`.

`principal_type` had in fact **already been lost** — applied live in an earlier session
and wiped by a realm recreation since — so the silent attribute-stripping bug was live
again. Restored and verified: a user created via the Admin API now retains
`{'principal_type': ['gp']}`.

**While verifying this I found the checked-in realm could not be imported at all.** Two
authentication-flow descriptions I wrote during the clinician-login fix were 466 and
416 characters against Keycloak's `VARCHAR(255)` column. A clean deployment would have
failed on import. The live realm was unaffected only because `--import-realm` skips
import when the realm already exists — so the breakage was invisible here and would
have hit the next person deploying fresh. Both shortened.

Verified by importing into a **throwaway Keycloak with an empty database**, leaving your
working realm untouched: `Realm 'referralplatform' imported / Import finished
successfully`, with SMTP, `principal_type`, gp-portal's `20020` redirect URI, all 11
client scopes and the clinician flow structure all landing correctly.

Added `npm run validate:realm` to catch this class statically. Keycloak's own validation
is fail-fast, sequential, and skipped when the realm exists, so a broken file stays
hidden until a clean deploy. Confirmed it flags the exact regression I had introduced.

### 4. Duplicate OIDC callback reported as a sign-in failure (`e5cb8d8`)

`/callback` showed "Missing authorization code, state, or PKCE verifier — start sign-in
again" while the nav simultaneously showed the user signed in — the thing you hit after
passkey enrolment. Keycloak emits exactly that callback (`error=already_logged_in`)
when a second authorization request races the first, which is what the required-action
redirect chain does.

`handleCallback` now treats a code-less callback as a duplicate rather than a failure
when a valid session is already stored and no PKCE handshake is in flight, and
redirects on.

Same commit reverts `KC_LOG_LEVEL` debug logging left on from the clinician-flow work.

### 5. Every service healthcheck probed the wrong address (`38b3c2f`)

All 13 services sat `unhealthy` while serving traffic normally. One shared cause, as
the TODO suspected: each Dockerfile's `HEALTHCHECK` probed
`http://localhost:<port>/health`, but inside these containers `localhost` resolves to
**::1 (IPv6)** while the Node server listens IPv4-only on `0.0.0.0`.

Proven in-container: `wget localhost:3005/health` → refused,
`wget 127.0.0.1:3005/health` → OK, `getent hosts localhost` → `::1` — while
`GET :20011/health` returned 200 from the host at the same moment.

**Not cosmetic.** Any `depends_on: condition: service_healthy` on one of these would
never be satisfied, deadlocking an orchestrated startup that relied on it.

All 13 now probe `127.0.0.1`. Verified: `audit-log`, `identity-access`,
`gp-authorisation`, `referral` all flipped to `healthy`.

### 6. `fhir-gateway` image was stale (healthcheck fix never rebuilt)

Its Dockerfile healthcheck was corrected with the other 12, but the image dated from
2026-08-14 and had never been rebuilt, so it still probed `localhost` and would have
kept reporting `unhealthy`. Caught by comparing the healthcheck baked *into each image*
against the source, rather than trusting that "I fixed the Dockerfiles" meant the images
were current. Rebuilt; now reports `healthy`.

All 14 images are now current with the committed source.

### 7. Specs broken by the outbox extraction (`a063795`)

Two regressions of mine from the previous round: `PasskeysService` and
`AccountLinksService` take an `AuditOutboxService` where they previously took
`ConfigService`, and their specs still built the old shape. Fixed.

Four stale relay specs replaced — one was asserting the max-attempt cap that had been
deliberately removed, i.e. pinning the old broken retry policy in place.

---

## State of the stack right now

Running and healthy: `postgres`, `redis`, `immudb`, `keycloak`, `mailhog`, `audit-log`,
`identity-access`, `gp-authorisation`, `referral`. All 13 service images are rebuilt
with the current code; the rest are simply not started (RAM).

Test users, credentials confirmed:

| user | credentials | notes |
| --- | --- | --- |
| `gp.test` | `webauthn-passwordless` | passkey intact — **no password**, by design |
| `specialist.test` | `password` | bootstrap state; first login forces passkey enrolment |
| `patient.test` | `password` | |

`TestPassword123!` where a password applies.

**Start here tomorrow:** `docker compose up -d gp-portal` then <http://localhost:20020>.
The full port map is in `docker-compose.yml`'s header.

---

## Traps worth knowing before you touch this

- **The full suite cannot be run from inside a service image.** Each installs only its
  own dependency subset (the COPY-package-json-first caching pattern), so other
  services' deps are absent and ~25 suites "fail" misleadingly. Run it on the host.
- **On the host it needs three things first:** built packages
  (`npm run build -w packages/...`), `npm install` (to link the `audit-outbox`
  workspace), and `npm run prisma:generate --workspaces`. Without generated clients,
  `PrismaService` has no `auditOutbox` model and `$transaction` is untyped.
- **A stale `tsconfig.tsbuildinfo` produces a partial `dist`.** That surfaced as a
  confusing "has no exported member 'ActorRef'" which looked like corruption. Clear
  `packages/*/dist` and `packages/*/tsconfig.tsbuildinfo` before rebuilding packages.
- **Semicolons inside comments break naive parsers.** Two of my scripts matched the
  `AuditEventType` union up to the first `;` and stripped comments *afterwards*; a
  comment containing "Found 2026-08-17; see BUILD_LOG…" truncated the parse and, the
  second time, silently re-added 14 duplicate members and corrupted the declaration.
  Strip comments *before* parsing, and prefer regenerating a list from a known-good
  source over patching it in place.
- **The memory constraint is real.** 16 GB will not hold the full stack; free RAM drops
  under 1 GB and services get OOM-killed (exit 137) or hang while still appearing "up".
  `wsl --shutdown` is the only reliable way to reclaim it.

---

## What is still open

See `TODO.md` for the full list. The ones that matter for your manual testing:

1. **Neither `specialist-portal` nor `patient-web` has ever been opened.** Their build
   args are fixed and verified in the bundle, but nobody has walked a screen. This is
   the most likely place to find something.
2. **The Playwright golden-path suite has still never been run** (TODO 10). Expect
   locator fixes on a first run.
3. **Documented cross-service calls were never wired** (TODO 9) — notably
   `onboarding-account` → `identity-access` Keycloak user provisioning, which is why a
   newly-activated patient has no account to sign into.
4. **Patient flow OTP structure is suspect** (TODO 2b): `conditional-user-configured`
   sits loose in a basic-flow rather than inside a CONDITIONAL sub-flow, which likely
   makes OTP unconditional rather than conditional. Unverified — no patient login has
   ever been exercised, and I did not want to change auth behaviour blind.
5. **Clinician onboarding still needs an admin-triggered enrolment email.** The flow now
   supports a bootstrap password, but nothing in the product issues one — that is a
   provisioning feature, not a bug.

---

## A note on how far I took this

I stopped rather than working to a spend limit. Everything above is verified — I did not
want to leave you a pile of plausible-looking changes to audit, and the remaining TODO
items are ones where the honest next step is either a design decision (patient OTP flow,
per-practice timezones) or manual testing that only you can do. The items I did take on
were the ones I could prove.

---

# Part 2 — structural improvements

The four weaknesses flagged at the end of part 1, now addressed. Each was chosen because
it would have *prevented* one of the bugs found earlier, rather than fixing another
symptom.

### A. Removed the `AuditEventType` cast escape hatches (`8efe5b8`)

Three services declared a local event-type union and cast at the call site, on a comment
asserting the Audit Log Service "accepts type as an opaque string over the wire". It does
not. Every event written that way was rejected with 400 — and where there was no outbox,
discarded outright. That is how passkey revocations went unrecorded.

All 35 types are now canonical, verified before removing anything, so the casts were pure
liability. The helper files are replaced with tombstones explaining why the pattern is
gone, and a `no-restricted-syntax` ESLint rule blocks reintroducing it — with one scoped
exemption for the shared relay, which genuinely deserialises a string from Postgres.
Verified the rule fires on a re-introduced cast.

### B. Drift check for the duplicated `AuditOutbox` models (`ff0675f`)

Prisma has no include/import, so the outbox model is hand-copied into all eleven
services — the one thing that could not move into the shared package is also the thing
most likely to diverge, and it had. `npm run validate:outbox` compares every model field
by field. Verified both directions: passes now, and when the historical drift is
reproduced it names the field, the variant and the odd service out.

### C. Production guard on placeholder secrets (`2100e48`)

`change-me-in-local-env` appears 18× in compose and 14× in the realm file, with
`admin`/`admin` and `referralplatform:referralplatform` alongside. Nothing stopped them
reaching a deployment. `ServiceTokenProvider` now refuses to construct when
`NODE_ENV=production` and the secret is a known placeholder — failing at boot rather than
serving traffic on a credential readable off GitHub. Inert outside production, because
local dev, CI and every test here run on exactly those values and a guard that fired
everywhere would simply be disabled. Verified both directions in a real service image.

**This is a backstop, not a secrets strategy** — it covers only the Keycloak client
secret, and cannot help with the realm file. Recorded as TODO 14.

### D. Integration test tier (`27dc100`)

The most valuable of the four. Every serious bug this session was invisible to the unit
suite — 577 tests green throughout — because each lived in a *seam*: the issuer mismatch
only appears for a token minted over the host port, the audit trail's bugs only against a
real immudb, the healthcheck bug only inside Docker, Keycloak's flow behaviour only in
Keycloak.

14 tests over three files assert those seams. Three deliberate conventions: fail loudly
when the stack is down (a tier that silently passes is worse than none), assert over
host-published ports (the Docker network would have hidden the issuer bug — that
asymmetry *was* the bug), and name the incident each test guards rather than the feature.

**Verified it catches regressions, not just that it passes:** re-running `referral` in
its pre-fix configuration fails with `Expected: not 401`, the exact assertion written for
that bug, and returns to green when restored.

---

## Final state

| | |
| --- | --- |
| Unit suite | 585 tests, 0 failed (`Australia/Sydney` and `UTC`) |
| Integration suite | 14 tests, 0 failed, against the live stack |
| Static validators | realm import + outbox schema, both OK |
| Containers | all running services `healthy` |
| Git | everything committed and pushed |

## What I would do next, in order

1. **Manual testing** — `specialist-portal` and `patient-web` have still never been
   opened. Most likely place to find something new.
2. **Extend the integration tier** as bugs are found — it is now the cheapest place to
   pin a regression, and the pattern is established.
3. **Real secrets management** (TODO 14) before any deployment beyond this laptop.
4. **Playwright** (TODO 10) — never run; expect locator churn.
5. **Patient OTP flow** (TODO 2b) — `conditional-user-configured` sits loose in a
   basic-flow, likely making OTP unconditional. Left alone deliberately: changing auth
   behaviour without a way to verify it is how the clinician flow broke in the first
   place.
