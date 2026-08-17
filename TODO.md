# TODO — outstanding issues

Known-open items, most consequential first. Written 2026-08-17 after fixing the
Keycloak issuer mismatch. Background for most entries is in
[`BUILD_LOG/local-build-fixes.md`](./BUILD_LOG/local-build-fixes.md) — read the
relevant section there before picking one up.

Status key: **[BLOCKER]** stops real use · **[BUG]** wrong behaviour · **[GAP]**
never built/verified · **[CHORE]** tidy-up.

---

## 1. ~~[BLOCKER] The audit trail records nothing~~ — **FIXED 2026-08-17**

Resolved end-to-end: writes, cryptographic verification, and the outbox relay all
work. `audit_event_index` went 0 → 19 rows, every running service's outbox drained to
zero pending, and `POST /audit-events/:id/verify` returns
`valid: true` with both `immudbProofValid` and `nashSignatureValid` true. It took
**four** independent bugs, all documented in `BUILD_LOG/local-build-fixes.md`:

1. immudb server/client version gap (`verifiedSet dual verification failed`) — server
   pinned to `codenotary/immudb:1.1.0` to match `immudb-node@1.1.1`'s proof format.
2. That older server rejects underscores in database names, so `IMMUDB_DATABASE` had
   to change `audit_log` → `auditlog`.
3. `ImmudbService.verifiedGet` base64-decoded a value the SDK already returns as a
   plain UTF-8 string, corrupting it so `JSON.parse` threw — which a bare `catch {}`
   then reported as `immudbProofValid: false`. **The tamper-evidence check was
   failing on entries that were perfectly intact**, with nothing logged to
   distinguish a real proof failure from a decode bug. That `catch` now logs.
4. Ten event types that `onboarding-account` and `admin-console` deliberately emit
   were missing from both `AuditEventType` and audit-log's runtime whitelist, so
   every one was rejected with 400 and retried until it hit the attempts cap.

**Residual clean-up, worth a look:** two follow-ons surfaced while fixing this —
see items 1a and 1b.

## 1a. ~~[BUG] Dead-lettered outbox rows have no recovery path~~ — **FIXED 2026-08-17**

Fixed across **all eleven** relays (not six — that figure came from an earlier
miscount of mine). One uniform retry policy replaces two different broken ones:

- Four relays tracked `attempts` and gave up permanently at `MAX_ATTEMPTS = 8`. At a
  5-second poll that is a **40-second** retry budget — shorter than an `audit-log`
  restart — so a routine deploy could permanently strand audit records.
- The other seven had no bookkeeping at all: they retried every 5s forever with no
  backoff and recorded nothing about failures, hammering a service that was already
  down and leaving nothing to diagnose. (My earlier note said only
  `specialist_review` and `admin_console` were affected; it was seven services.)

Now: exponential backoff (5s → 10s → 20s → … capped at 5 min) via a new
`nextAttemptAt` column, **no permanent give-up**, and `attempts`/`lastError` present
everywhere for diagnosis. A row still failing after 8 attempts is logged at error
level — but it stays queued and keeps retrying. For an audit trail, retrying for hours
must always beat discarding: a late entry does not break non-repudiation, a lost one
does.

Verified end-to-end by repeating the exact outage that previously destroyed an event:
at 100 seconds down (well past the old 40-second budget) the row was still queued and
alive, and it delivered on recovery.

```
failed attempt 1, retrying in 5s      → attempt 4, retrying in 40s
failed attempt 5, retrying in 80s     → relayed = t after audit-log returned
```

All eleven `audit_outbox` tables now carry `attempts`, `lastError` and `nextAttemptAt`
(migration `20260817060000_audit_outbox_retry_policy`), which also closes 1b.

**Still worth doing** (not a bug, but the reason this took eleven near-identical
edits): the relay is copy-pasted per service and the eleven copies had already drifted
into two behaviours. It belongs in a shared package so there is one implementation to
fix. An admin requeue endpoint is also still absent — recovery from a genuinely stuck
row is manual SQL — though with no give-up it is now far less likely to be needed.

## 1a-original. [ORIGINAL ANALYSIS — kept for context]

`AuditOutboxRelayService` stops retrying a row once `attempts` reaches
`MAX_ATTEMPTS = 8` (`where: { publishedAt: null, attempts: { lt: MAX_ATTEMPTS } }`).
When the four bugs above were fixed, the affected rows stayed stuck forever because
they had already exhausted their attempts — they only relayed after a manual
`UPDATE ... SET attempts = 0`. There is no operational way to requeue them short of
hand-written SQL, and nothing surfaces that rows are stranded. Given the class
comment explicitly says nothing should ever be discarded "since a lost entry here
would silently break the platform's non-repudiation guarantee", a permanently-skipped
row is exactly that failure in a different costume. Needs at minimum an alert/metric,
and probably an admin requeue endpoint.

## 1b. [GAP] Outbox schemas are inconsistent across services

`onboarding_account.audit_outbox` has `attempts` and `lastError` columns;
`specialist_review.audit_outbox` and `admin_console.audit_outbox` do **not**. So the
retry cap and the error diagnostics that made item 1a debuggable simply don't exist in
some services. Reconcile the Prisma schemas. (Those two services still have pending
rows purely because they were stopped to save RAM, not because of a bug — they should
drain when started, and that should be confirmed.)

## 2. ~~[BLOCKER] A new clinician cannot sign in at all~~ — **FIXED 2026-08-17**

`clinician-browser Forms` now runs `auth-username-form` (REQUIRED) → a new
`clinician-browser Credential` sub-flow (REQUIRED) holding
`webauthn-authenticator-passwordless` (ALTERNATIVE) and `auth-password-form`
(ALTERNATIVE). Keycloak only offers a branch the user actually holds a credential for,
which gives exactly the required behaviour:

| user | offered | verified |
| --- | --- | --- |
| enrolled clinician (passkey, **no** password) | passkey only | `gp.test` → PASSKEY PROMPT |
| new clinician (bootstrap password, no passkey) | password, then **forced** enrolment | `specialist.test` → PASSWORD FORM → Passkey Registration |

AAL2/AAL3 is preserved because an enrolled clinician has no password credential to
fall back to — **not** because the flow forbids it. See item 2a: nothing enforces that
yet.

Also fixed in both `clinician-browser` and `patient-carer-browser`: the `Forms`
sub-flow was REQUIRED while `Cookie` (and, in the patient flow, `Identity Provider
Redirector`) sat beside it as ALTERNATIVE. Keycloak logged
`REQUIRED and ALTERNATIVE elements at same level! Those alternative executions will be
ignored` on every single login — meaning **SSO cookie re-authentication never worked**
(full re-auth every time) and, in the patient flow, **the myID/TDIF identity-provider
redirector could never fire at all**. Both sub-flows are now ALTERNATIVE siblings.

## 2a. ~~[GAP] Nothing enforces "clinicians hold no password"~~ — **FIXED 2026-08-17**

`ClinicianCredentialReconciler` (`services/identity-access/src/passkeys/`) sweeps every
account holding the `gp` or `specialist` realm role and deletes the bootstrap password
of any clinician who already holds a `webauthn-passwordless` credential. Runs once at
application bootstrap and every 15 minutes thereafter.

A clinician holding a password but **no** passkey is deliberately left alone — they are
mid-onboarding and that password is their only way in. Verified live: a sweep over 2
clinician accounts removed `gp.test`'s redundant password (leaving
`['webauthn-passwordless']`) and left `specialist.test` untouched (`['password']`), and
wrote an `identity.bootstrap_password.removed` audit event.

A reconciler rather than an event hook because enrolment completes inside Keycloak's
own required-action UI, which the service never observes; hooking it would mean
shipping a Keycloak event-listener SPI JAR. The sweep is also self-healing — it catches
drift no hook would see (an admin re-adding a password, a realm re-import, a restored
backup).

Deliberately uses `GET /users` + per-user role mappings rather than
`GET /roles/{role}/users`, because the latter needs the `view-realm` client role, which
would grant this service account read access to the entire realm configuration. Noted
in the code: prefer background paging over widening that privilege if the realm grows.

Note for testing: `gp.test` now has no password, so the ROPC/password grant used
throughout `BUILD_LOG/local-build-fixes.md` no longer works for that user — and the
reconciler will now actively strip any password re-added to an enrolled clinician. Use
`specialist.test` (still bootstrapped) or a service account instead.

## 2d. ~~[GAP] identity-access writes audit events directly, so failures lose them~~ — **FIXED 2026-08-17**

`identity-access` now has the standard outbox (`src/audit-outbox/`, `AuditOutbox`
model + migration `20260817051958_add_audit_outbox`), and all five IAM call sites —
passkey revoke, re-enrolment required, social link created/removed, bootstrap password
removed — enqueue instead of calling the Audit Log Service in the request path.

Proven against a real outage rather than assumed: with `audit-log` stopped, a triggered
event was retained in the outbox (`relayed=f, attempts=6, lastError='fetch failed'`)
where the old direct write would simply have discarded it, and it reached the audit
trail once the service returned.

**But that test also exposed how shallow the durability actually is — see 1a.**

## 1a-addendum. [BUG] Measured: a ~40-second outage permanently strands an audit event

While testing the above, the queued event hit `MAX_ATTEMPTS = 8` *during the outage
itself* and was permanently skipped. With a 5-second poll and a cap of 8, the retry
budget is **40 seconds** — shorter than the time `audit-log` takes to restart. So an
ordinary deploy or restart of the Audit Log Service can permanently strand audit
records, in every service using this relay, not just this one.

It only recovered because I ran `UPDATE ... SET attempts = 0` by hand, which is the
same manual step item 1a already describes and still the only way back.

This makes 1a materially more urgent than its original wording suggested: it is not a
tidiness issue about visibility, it is a bug that loses audit records during routine
operations. The retry policy needs exponential backoff and a far longer (or no) give-up
horizon — losing an audit entry should be strictly worse than retrying for hours.
`identity-access`'s relay at least now logs `STRANDED ...` at error level when a row
gives up (verified firing); the other services still fail silently.

## 2d-original. [ORIGINAL ANALYSIS — kept for context]

`identity-access` writes IAM events (`identity.passkey.revoked`,
`identity.bootstrap_password.removed`, …) with direct `auditClient.record()` calls
rather than through the outbox pattern — a documented judgment call, on the grounds
that IAM events have no clinical transaction to stay atomic with. The consequence only
became visible today: those four event types were **missing from audit-log's runtime
whitelist**, so every write was rejected with 400 and, having no outbox, was **dropped
outright** — passkey revocations included. The types are now registered (fixed), but
the durability gap remains: any future audit-log outage or validation drift silently
loses IAM events instead of retrying them.

The reconciler now logs a loud, account-specific error when an audit write fails after
a credential change, but that is a mitigation, not a fix. Consider moving IAM events
onto the same outbox mechanism every other service uses.

## 2b. [BUG] The patient flow's OTP step is structurally suspect

`patient-carer-browser Password+OTP` is a basic-flow containing `auth-password-form`
(REQUIRED), `conditional-user-configured` (CONDITIONAL), then `auth-otp-form`
(REQUIRED). Conditions are only evaluated inside a **CONDITIONAL sub-flow**; sitting
loose in a basic-flow it likely does nothing, which would make OTP unconditionally
required rather than "conditional on the user having OTP configured" as intended. Not
verified either way — no patient login has ever been exercised. Confirm before relying
on patient auth behaviour.

## 2c. [ORIGINAL ANALYSIS — kept for context]

`clinician-browser Forms` runs `auth-username-form` (REQUIRED) then
`webauthn-authenticator-passwordless` (REQUIRED). Per Keycloak's
`AuthenticationSelectionResolver.createAuthenticationSelectionList` (checked against
the real v26.0.8 source), once the username step resolves a user, the WebAuthn
execution is only selectable if that user *already* has a matching credential — a
bare REQUIRED execution has no inline "register one now" path, regardless of
`userSetupAllowed: true`. WebAuthn Passwordless is designed to resolve the user
itself from a discoverable credential, with **no** preceding username step.

So every brand-new GP/specialist dead-ends on "Cannot login, credential setup
required" and needs out-of-band admin intervention. Tonight's login only worked
because a passkey was enrolled via an `execute-actions-email` magic link.

**This is a production onboarding defect, not just a local-dev annoyance.**
`patient-carer-browser` has the same structural pattern. Read
`.claude/docs/identity-security-recommendations.md` §6 before changing either — the
flow was presumably authored to hit specific AAL2/AAL3 requirements, so the fix needs
to preserve the assurance level while actually being enrollable.

## 3. [PARTLY FIXED 2026-08-17] Two of the three frontends have never been run

**The build-arg half is fixed.** `specialist-portal` (8 vars) and `patient-web` (12)
now receive their `NEXT_PUBLIC_*` values as Docker build args and re-export them as ENV
before `next build`, matching the gp-portal fix. Both previously shipped the
*pre-port-remap* fallbacks hard-coded in their source (8180, 3101/3102, 3005-3010) —
the same defect that made gp-portal redirect sign-in to a dead port.

Verified by inspecting the built images rather than trusting the config: `.next/static`
(the client chunks) now contains **zero** stale URLs and the correct 200xx values, in
both apps. (Unreplaced `process.env.NEXT_PUBLIC_*` text still appears in a server-side
`.js.map` source map — that is inert, and server-side reads get the right value from
the container environment at runtime.)

**Still open:** neither app has actually been opened and walked through. That needs
manual testing.

## 3-original. [ORIGINAL ANALYSIS — kept for context]

`specialist-portal` and `patient-web` have not been opened, let alone exercised. Both
certainly still carry the **`NEXT_PUBLIC_*` build-arg bug** fixed for `gp-portal`
(their Dockerfiles have no `ARG`/`ENV` wiring, so Next.js bakes in the stale
pre-port-remap fallback URLs from each app's `lib/api/config.ts` at build time). Apply
the same fix as `apps/gp-portal/Dockerfile` + the `build.args` block in
`docker-compose.yml`, rebuild, then actually walk their screens.

## 4. [GAP] Only 3 of 12 rebuilt services were spot-checked after the issuer fix

The issuer fix (`KEYCLOAK_PUBLIC_ISSUER` + `jwksUri` split) was applied to all 12 Node
services and all 12 rebuilt, but only `referral` and `followup-recall` were verified
returning 200 with a browser-path token, plus `directory` returning a non-401. The
other nine are unverified. `audit-log` in particular never started during the final
check. Per `CLAUDE.md`'s working style, each should be brought up and confirmed
individually (health + one authenticated call) rather than assumed.

## 5. ~~[BUG] Several services sit `unhealthy`~~ — **FIXED 2026-08-17**

One shared cause across all 13, as suspected: every Dockerfile's `HEALTHCHECK` probed
`http://localhost:<port>/health`, but inside these containers `localhost` resolves to
**::1 (IPv6)** while the Node server listens IPv4-only on `0.0.0.0`. So the probe got
"connection refused" and the container sat `unhealthy` while serving traffic perfectly
well — `GET :20011/health` returned 200 from the host at the same moment.

Proven inside the container: `wget localhost:3005/health` → refused,
`wget 127.0.0.1:3005/health` → OK, `getent hosts localhost` → `::1`.

All 13 now probe `127.0.0.1`. Verified: `audit-log`, `identity-access`,
`gp-authorisation` and `referral` all flipped to `healthy` after rebuild.

This was more than cosmetic — a `depends_on: condition: service_healthy` on any of
these would never have been satisfied, so it would have deadlocked an orchestrated
startup that relied on it.

## 5-original. [ORIGINAL ANALYSIS — kept for context]

Observed earlier: `directory`, `audit-log`, `followup-recall`, `specialist-review`,
`consent-security`, `referral`, `gp-authorisation` all reporting `unhealthy` while
still serving traffic. For `audit-log` the cause is likely item 1 (the immudb write
loop erroring constantly). The others are undiagnosed — it may be one shared cause
(healthcheck definition, start period too short) rather than seven separate faults.
Worth checking the healthcheck definitions before assuming the services are at fault.

## 6. [BUG] The Follow-up & recall page hides backend errors behind an empty state

When its backend call failed with 401, the page rendered "No Follow-up Plans found for
known patients" — i.e. it reported *success with no data* for what was actually an
auth failure. That's how the issuer bug stayed invisible on that screen. It should
distinguish "request failed" from "request succeeded, zero results". Worth auditing
the other dashboards for the same pattern.

## 7. ~~[BUG] `gp-portal` callback misreports a successful login~~ — **FIXED 2026-08-17**

`handleCallback` now treats a code-less callback as a duplicate rather than a failure
when a valid session is already stored and no PKCE handshake is in flight — it
redirects on instead of rendering "start sign-in again" at a user who is demonstrably
signed in. Keycloak produces exactly that callback (`error=already_logged_in`) when a
second authorization request races the first, which is what the required-action
redirect chain does after passkey enrolment.

## 7-original. [ORIGINAL ANALYSIS — kept for context]

After a genuine successful sign-in, `/callback` can show "Missing authorization code,
state, or PKCE verifier — start sign-in again" while the nav simultaneously shows the
user as signed in. Keycloak logs `error="already_logged_in"` with
`redirected_to_client="true"` — a duplicate authorization request (left over from the
required-action redirect chain) bounces back to `/callback` without a `code`. The
handler should recognise `error=already_logged_in` and redirect home.

## 8. ~~[GAP] Realm state that exists only live~~ — **FIXED 2026-08-17**

`smtpServer` (→ mailhog) and the declarative User Profile declaring `principal_type`
are now both in `realm-export.json`.

Note `principal_type` had been **lost entirely** — it was applied live in an earlier
session and wiped by one of the realm recreations since, so the silent
attribute-stripping bug was live again. Restored and re-verified: a user created via
the Admin API with `attributes.principal_type` now comes back with
`{'principal_type': ['gp']}` instead of having it silently dropped.

**While verifying this I found the checked-in realm could not be imported at all.**
Two authentication-flow descriptions written during the clinician-login fix were 466
and 416 characters against Keycloak's `VARCHAR(255)` column, so a clean deployment
would have failed on import. Both shortened. Verified by importing the file into a
throwaway Keycloak with an empty database — `Realm 'referralplatform' imported /
Import finished successfully` — and confirming SMTP, the `principal_type` attribute,
gp-portal's `20020` redirect URI, all 11 client scopes and the clinician flow structure
all survive.

Added `npm run validate:realm` (`infra/keycloak/validate-realm-export.mjs`) to catch
this class statically, since Keycloak's own validation is fail-fast, sequential, and
skipped entirely when the realm already exists — so a broken file stays invisible until
someone does a clean deploy. Verified it flags the exact regression I had introduced.

## 8-original. [ORIGINAL ANALYSIS — kept for context]

`realm-export.json` is now the source of truth again (Keycloak has a persistent volume
as of this session), but two things were applied **live via the Admin API only** and
are not in the file:

- **SMTP config** (`smtpServer` → `mailhog:1025`). Without it, `execute-actions-email`
  — the only way to enrol a passkey today, see item 2 — silently has nowhere to send.
- **User Profile `principal_type` attribute** (from an earlier session). Without it,
  Keycloak silently strips `principal_type` from users created via the Admin API, and
  `packages/auth-client` then defaults them to `system`, failing every role check with
  a confusing 403.

Both should be written into `realm-export.json` and verified by deleting the realm and
re-importing.

## 9. [GAP] Documented cross-service calls that were never wired up

Pre-existing from the original build (see `BUILD_LOG.md` for the full list):
`referral` → `specialist-review` `POST /cases`; `onboarding-account` → `referral`
`activate-queued`; `onboarding-account` → `identity-access` Keycloak user provisioning
on patient/carer activation. That last one is what makes a newly-activated patient
have no account to sign into.

## 10. [GAP] The Playwright golden-path suite has still never been run

`e2e/tests/golden-path.spec.ts` automates the same walkthrough that was exercised by
hand via API calls. It has never executed against a live stack. Expect locator fixes
on first run. Note it will also hit items 2 and 3 (it drives all three web apps
through real browser logins), so those likely need fixing first.

## 11. ~~[CHORE] Debug logging left enabled on Keycloak~~ — **FIXED 2026-08-17**

`KC_LOG_LEVEL` removed from `docker-compose.yml`; Keycloak is back to default logging.

## 11-original. [ORIGINAL ANALYSIS — kept for context]

`KC_LOG_LEVEL: 'info,org.keycloak.authentication:debug'` is still set in
`docker-compose.yml` from tonight's troubleshooting. It's noisy — revert once items 2
and 8 are settled.

## 12. [CHORE] No unit tests were run after the issuer-fix edit

The `createTokenVerifier` change touched all 12 services' `src/common/clients.ts`. The
new code falls back to `KEYCLOAK_ISSUER` when `KEYCLOAK_PUBLIC_ISSUER` is unset,
specifically so existing tests keep passing — but `npm run test` has not actually been
run to confirm that.

---

## Environment constraint (not a bug, but it shapes everything)

This 16GB machine **cannot run all 21 services at once** — free memory drops below 1GB
and already-verified services get OOM-killed (exit 137) or hang while still appearing
"up". Work on a subset, and see `CLAUDE.md` for the `wsl --shutdown` recovery routine
and the stale-`wslrelay.exe` port-squatting issue that produces very convincing
false-positive "the app is broken" symptoms.

## 13. ~~[BUG] Two booking tests assume the runner's timezone is UTC~~ — **FIXED 2026-08-17**

It was not a test bug. `slot-matching.ts` evaluated a patient's day/time preference
with `Date.getDay()`/`getHours()` — the *server's* timezone. Containers run UTC, so
"Wednesday afternoon" for an Australian patient resolved to Wednesday 22:00–Thursday
03:00 Sydney time: the middle of the night, on the wrong day. The mock calendar had the
same flaw, generating its "standard AU clinic hours" 09:00–17:00 in server-local time
(19:00–03:00 Sydney in a UTC container).

Fixed by making the clinic timezone explicit (`services/booking/src/common/clinic-time.ts`,
`CLINIC_TIME_ZONE`, default `Australia/Sydney`, overridable per deployment). Matching
and slot generation both resolve through `Intl.DateTimeFormat` with an explicit zone,
so they are correct across daylight-saving transitions without a date library. Tests
now state intent as clinic wall-clock times via `clinicWallClock()` rather than bare
ISO strings — `new Date('2026-09-01T09:00:00')` has no offset and is parsed in the
server's zone, which is how these passed only on the machine they were written on.

Verified: booking's 42 tests pass under Australia/Sydney, UTC, America/New_York and
Asia/Kolkata (deliberately including a half-hour offset), and the full workspace suite
passes under both Sydney and UTC.

**Known simplification:** one platform-wide timezone, where the correct model is
per-practice — Australia spans five zones, and a clinic appointment means the
*specialist's* local time. Recorded in the code.

## 13-original. [ORIGINAL ANALYSIS — kept for context]

`MockCalendarClient › only returns free windows within AU clinic hours on weekdays` and
`BookingService › create — preference matching › auto-confirms the best-matching
available slot` fail on a machine set to an Australian timezone and pass under
`TZ=UTC`. Both assert on `getUTCHours()` / absolute UTC instants while the mock builds
its windows in local time, so "AU clinic hours" only holds when local time *is* UTC.

Pre-existing (untouched since the original build, `d140b5d`), and invisible in CI/Docker
because those run UTC — but it means the suite fails for any developer in the
platform's own target market. Fix by pinning the timezone in the booking jest config,
or by making the mock and its assertions agree on a single timezone.
