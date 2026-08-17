# TODO — outstanding issues

Known-open items, most consequential first. Written 2026-08-17 after fixing the
Keycloak issuer mismatch. Background for most entries is in
[`BUILD_LOG/local-build-fixes.md`](./BUILD_LOG/local-build-fixes.md) — read the
relevant section there before picking one up.

Status key: **[BLOCKER]** stops real use · **[BUG]** wrong behaviour · **[GAP]**
never built/verified · **[CHORE]** tidy-up.

---

## 1. [BLOCKER] The audit trail records nothing — immudb writes fail on every attempt

`audit_log.audit_event_index` has **0 rows** while five services hold 24 unrelayed
entries in their local `audit_outbox` tables. Every `verifiedSet` fails with
`verifiedSet dual verification failed` — the client's cryptographic proof check
rejects the server's response on *every* write, immediately, from a cold start.

Root cause is a version gap: `immudb-node@1.1.1` (client, 2021 — its release notes
say "Update schema to version 1.1.0 of immudb") against a much newer server. Pinning
the server to `codenotary/immudb:1.1.0` was attempted and **not** verified before the
session moved on — `docker-compose.yml` currently pins `1.1.0`, so **confirm whether
that actually fixed it** before doing anything else here.

This matters more than its ticket position suggests: an immutable, signed audit trail
is the platform's core compliance claim, and it currently records nothing. Note also
there is no actively-maintained Node SDK to upgrade to (all candidates are years
stale), so if version-pinning fails the options are the `immugw` REST proxy or
replacing the SDK usage.

## 2. [BLOCKER] A new clinician cannot sign in at all — the login flow can't enrol a passkey

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
