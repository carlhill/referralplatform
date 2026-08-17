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

## 1a. [BUG] Dead-lettered outbox rows have no recovery path

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

## 2d. [GAP] identity-access writes audit events directly, so failures lose them

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

## 3. [GAP] Two of the three frontends have never been run at all

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

## 5. [BUG] Several services sit `unhealthy` and nobody has diagnosed why

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

## 7. [BUG] `gp-portal` callback misreports a successful login

After a genuine successful sign-in, `/callback` can show "Missing authorization code,
state, or PKCE verifier — start sign-in again" while the nav simultaneously shows the
user as signed in. Keycloak logs `error="already_logged_in"` with
`redirected_to_client="true"` — a duplicate authorization request (left over from the
required-action redirect chain) bounces back to `/callback` without a `code`. The
handler should recognise `error=already_logged_in` and redirect home.

## 8. [GAP] Realm state that exists only live, and will vanish on a fresh import

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

## 11. [CHORE] Debug logging left enabled on Keycloak

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
