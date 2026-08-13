# BUILD_LOG: patient-app (apps/patient-mobile + apps/patient-web)

2026-08-13 — built both patient/carer-facing frontends in one pass, per
`claude/ui-design.md`'s patient screen inventory: onboarding, home dashboard,
new-GP-approval (push-approval), referral timeline/detail with message thread,
booking preference capture, consent & security (linked-GP management + revoke),
raise-a-concern, and document vault. Both apps call real backend services with
`fetch` — no mocked business data inside either app. Scope for this session was
`apps/patient-mobile` (Expo/React Native — the primary surface) and
`apps/patient-web` (Next.js — the companion web app), per the task brief; nothing
outside those two directories (and this file) was touched.

## What was built

### `apps/patient-web` (Next.js App Router)

Built on the same conventions `apps/gp-portal`/`apps/specialist-portal` already
established (root CONVENTIONS.md was followed, not reinvented):

- **`lib/api/`** — `config.ts` (service base URLs, `NEXT_PUBLIC_*` with
  hardcoded-localhost fallbacks, same pattern/caveat as gp-portal's `config.ts`:
  docker-compose.yml doesn't wire every var this app needs, editing it is
  scaffold-phase-owned), `http.ts` (typed `apiFetch` + `ApiError`, near-identical
  port of gp-portal's), `types.ts` (wire-shape types mirroring each service's
  actual Prisma-backed controller output), and one client module per backend
  service: `onboarding.ts`, `gpAuthorisation.ts`, `consentSecurity.ts` (linked
  GPs, consent records, referral-visibility, concerns), `referral.ts`,
  `booking.ts`, `notification.ts` (message threads), `passkeys.ts`. Every route
  called was cross-checked against that service's actual NestJS controller in
  this session (`onboarding.controller.ts`, `gp-links.controller.ts`,
  `linked-gps.controller.ts`, `consent-records.controller.ts`,
  `concerns.controller.ts`, `referral.controller.ts`, `booking.controller.ts`,
  `message-thread.controller.ts`, `passkeys.controller.ts`) — not assumed.
- **`lib/auth/`** — `pkce.ts` + `jwt.ts` (near-verbatim ports of gp-portal's) +
  `oidc-client.ts` + `AuthContext.tsx`: real Authorization Code + PKCE against
  Keycloak's `patient-web` public client, bound to the realm's
  `patient-carer-browser` flow (passkey offered as an ALTERNATIVE to
  password+conditional-OTP, per `identity-security-recommendations.md` §6 and
  `infra/keycloak/README.md`). See "Known gaps" below for why this flow can't
  be exercised against a real signed-in user yet, and the documented
  `buildLocalActivationSession` bridge that works around it for local dev.
- **Screens (`app/`)**: `/onboarding/activate` (token entry incl. deep-link
  query param → DOB/Medicare verify → patient-vs-carer branch with full carer
  detail capture (own-mobile-number question) → OTP → activation success),
  `/login`, `/callback`, `/` (dashboard: active referrals, pending GP-approval
  banner, quick links), `/referrals` (list) + `/referrals/[id]` (timeline built
  from the referral's own timestamp fields, compliance-flag summary, secure
  message thread — list + post, referral cancel), `/referrals/[id]/booking`
  (day/time preference capture, urgent-fast-path awareness, candidate-slot
  list, slot confirm), `/gp-approvals` (pending GP link requests — approve/
  decline/urgent-escalation-acknowledgement, step-up-aware error surfacing),
  `/consent` (linked-GPs list+revoke, sensitive-category access grant/revoke
  for named carers, passkey list/revoke/require-re-enrolment), `/concern`
  (plain-language triage checkboxes — no category picker, per
  `RaiseConcernDto`'s own shape — + past-concerns list), `/documents`
  (document vault — see "Known gaps").
- **Tests**: `lib/api/http.test.ts`, `lib/auth/jwt.test.ts`, `lib/ui/status.test.ts`
  (status-label/tone mapping logic), `app/page.test.tsx` (signed-out landing
  state, wrapped in a real `AuthProvider`). `npm run typecheck`, `npm run lint`,
  `npm run test`, and `npm run build` (Next.js production build, all 11 routes
  compile) were all run and pass in this sandbox.

### `apps/patient-mobile` (Expo/React Native)

- **New dependencies added** (all pinned to the SDK 57-recommended versions
  already used by this app, verified against `node_modules/expo/bundledNativeModules.json`
  where applicable): `expo-auth-session`, `expo-web-browser` (real OIDC
  Authorization Code + PKCE — `expo-auth-session` handles PKCE natively rather
  than hand-rolling Web Crypto, which Hermes doesn't reliably expose),
  `expo-secure-store` (Keychain/Keystore-backed token storage), `expo-local-authentication`
  (biometric app-lock), `expo-linking` (deep-link activation-token handling),
  `react-native-safe-area-context` (notch-safe layout — the starter `App.tsx`'s
  own doc comment flagged this as a follow-up for when real screens replaced
  the skeleton). `app.json` gained a `scheme` (`referralplatform://`) and the
  `expo-local-authentication` config plugin (Face ID usage string on iOS).
- **`lib/api/`** — same shape as patient-web's (config/http/types + one client
  per service), adapted only where the runtime differs (RN's global `fetch`
  needs no polyfill; error messages mention "reachable from your device" since
  `localhost` on a physical device means the device itself, documented in
  `config.ts`).
- **`lib/auth/`** — `jwt.ts` (rewritten to decode base64url with a small
  hand-rolled decoder instead of `atob`/`Buffer`, neither of which Hermes
  reliably exposes as a global across RN architectures — verified this decodes
  identically to the web version via `jwt.test.ts`), `storage.ts`
  (`expo-secure-store` wrapper, `sessionStorage` fallback on `Platform.OS === 'web'`
  builds), `oidc.ts` (pure token-set helpers + the same documented
  `buildLocalActivationSession` dev bridge as patient-web, using a hand-rolled
  base64url encoder — no native crypto dependency, unit-tested in
  `oidc.test.ts` including a non-ASCII round-trip), `AuthContext.tsx` (wires
  `expo-auth-session`'s `useAuthRequest`/`exchangeCodeAsync` for the real
  Keycloak flow), `biometricLock.ts` (`expo-local-authentication` wrapper — the
  "OTP + biometric app-lock as the working default" instruction; see "Known
  gaps" for the passkey/WebAuthn-on-Expo risk this is the concrete fallback
  for).
- **`components/ui.tsx`** — a small React Native design system (Card, Button,
  StatusBadge, Field, RadioOption, Checkbox, LoadingState, ErrorState, Screen)
  re-expressing `@referralplatform/ui-components`'s visual vocabulary with
  plain RN primitives, since that package is web-only (DOM + `lucide-react` +
  CSS custom properties) and not usable from React Native. Colours were
  hand-copied from `packages/ui-components/src/tokens.css`.
- **In-app router (`lib/nav.tsx`) — not `@react-navigation`.** Documented
  judgment call: this app's screen tree is shallow (no nested tab/stack
  combinations), and `@react-navigation`'s native dependencies
  (`react-native-screens`, `react-native-gesture-handler`) add real risk of
  native-linking breakage with no simulator/device available in this build's
  sandbox to verify against (the pre-existing `patient-mobile/README.md`
  already flags that exact constraint for `expo start`). A plain
  `useState`-driven route+params+history, exposed via context, keeps every
  screen a trivially-testable plain component and can be swapped for real
  navigation later without touching any screen's internals.
- **Screens (`screens/`)** — one file per `ui-design.md` inventory item, same
  functional coverage as patient-web: `OnboardingTokenScreen` (real
  `expo-linking` deep-link handling + manual-paste fallback),
  `VerifyIdentityScreen`, `SelectBranchScreen`, `OtpScreen`,
  `ActivationSuccessScreen` (biometric-availability check + hands off to
  `startLocalActivationSession`), `LoginScreen`, `HomeScreen`,
  `ReferralsScreen`, `ReferralDetailScreen` (timeline + message thread),
  `BookingScreen`, `GpApprovalsScreen`, `ConsentSecurityScreen`,
  `ConcernScreen`, `DocumentVaultScreen`, plus `AppShell` (shared signed-in
  chrome) and `AppLockScreen`/`RootRouter` (wiring).
- **`App.tsx`** — `SafeAreaProvider`/`SafeAreaView` → `AuthProvider` →
  `NavProvider` → `AppLockGate` (prompts biometric unlock once per
  newly-issued token when the device has enrolled biometrics; a no-op pass-
  through otherwise, per `biometricLock.ts`'s documented fallback) →
  `RootRouter`.
- **Tests**: `lib/auth/jwt.test.ts`, `lib/auth/oidc.test.ts` (local-session
  token round-trip incl. non-ASCII, expiry math), `lib/api/http.test.ts`,
  `lib/ui/status.test.ts`, `App.test.tsx` (boots to the sign-in screen with no
  stored session — exercises the real `AuthProvider`/`NavProvider`/
  `AppLockGate`/`RootRouter` chain end to end under Jest). Added
  `jest.setup.ts` (`setupFilesAfterEnv`) with manual mocks for
  `expo-secure-store`, `expo-local-authentication`, `expo-linking`,
  `expo-web-browser`, `expo-auth-session`, and `react-native-safe-area-context`
  — `jest-expo`'s preset doesn't ship mocks for these specific packages, so
  without this every test touching `AuthContext`/`App` would hit real native
  bindings that don't exist under Jest. `.ts` (not `.js`) deliberately, so
  typescript-eslint's TS override (which turns off `no-undef`, since the TS
  compiler already covers it) applies to the `jest`/`require` globals used
  inside it — matching how every other `*.test.ts` file in this monorepo
  already avoids that lint error. `npm run typecheck`, `npm run lint`, and
  `npm run test` were all run and pass in this sandbox. `expo start`/an actual
  on-device or simulator boot were **not** exercised — no simulator or device
  was available in this sandbox, same constraint the pre-existing
  `patient-mobile/README.md` already documented for the scaffold. `npm install`
  (root) + `tsc --noEmit` + `jest` were the practical smoke test instead.

## Key decisions

1. **No `@react-navigation` in patient-mobile.** See `lib/nav.tsx`'s own doc
   comment (summarized above) — a deliberate, documented deviation from what
   might be the "obvious" RN choice, made for testability/sandbox-safety, not
   because react-navigation is a bad fit long-term.
2. **A hand-rolled React Native mini design system (`components/ui.tsx`)
   instead of extending `@referralplatform/ui-components`.** That package is
   structurally web-only (DOM elements, `lucide-react`, CSS custom
   properties) — there was no version of "reuse it" available without
   substantially reworking a shared package outside this session's scope
   (`packages/*` wasn't touched, per the task brief). Colours were manually
   kept in sync with `packages/ui-components/src/tokens.css` so the three
   surfaces (gp-portal, specialist-portal, patient-web, patient-mobile) still
   read as one product.
3. **`buildLocalActivationSession` (both apps) — a documented, clearly-labelled
   dev-only bridge, not a real auth mechanism.** See "Known gaps" below.
4. **Document vault is a derived, honestly-labelled placeholder, not a real
   document store.** No dedicated document-storage service exists anywhere in
   this build (it's not in root CONVENTIONS.md §1's service list) — real
   referral letters/specialist letters/pathology results would live there once
   it exists. Both apps' Document Vault screens derive a "document" per
   referral from data the Referral Service already returns (the referral
   letter text + AI structured summary) and clearly badge this as a
   placeholder ("specialist letters & results coming soon"), rather than
   pretending a real vault exists. patient-web offers a text-file download
   (`Blob`/`URL.createObjectURL`); patient-mobile shows the same content
   inline (no `expo-file-system`/`expo-sharing` dependency added just for a
   placeholder).
5. **Booking preference capture requires the referral to already have a
   `specialistId`.** `Referral.specialistId` is optional and only set at
   referral-creation time by the GP (or, per the design, would later be filled
   in by the Directory Service's specialist-matching — out of this session's
   scope). When absent, both booking screens show "your GP hasn't assigned a
   specialist yet" rather than erroring — a real, checked state, not a guess.

## Known gaps (MOCK / not wired end-to-end)

- **No Keycloak user is provisioned for a patient/carer anywhere in this
  build.** `services/onboarding-account`'s own `onboarding.controller.ts` doc
  comment and BUILD_LOG already flag this same gap on the backend side (OTP
  verification activates the `Patient`/`Carer` Postgres record but never calls
  Keycloak's Admin API — `services/identity-access/src/keycloak-admin` exists
  and could do this — to create a matching Keycloak user). Consequence: the
  real OIDC Authorization Code + PKCE flow built in both apps
  (`lib/auth/oidc-client.ts` / `lib/auth/AuthContext.tsx`) is genuine,
  correctly-shaped, verified-to-prepare-a-valid-`code_challenge` code — but
  there is no user account on the other end of it in this build. To keep both
  apps click-through-able end to end in local dev regardless, onboarding
  activation success calls a documented, clearly-named
  `buildLocalActivationSession` helper that synthesises an **unsigned**
  (`alg: none`) local token set carrying the newly-activated `patientId`/role.
  This is **never** accepted by any real backend `TokenVerifier` (root
  CONVENTIONS.md §8) — it only unblocks UI-level click-through testing in this
  sandbox. Closing the real gap is a backend change (wiring
  `services/onboarding-account`'s `verifyOtp` to
  `services/identity-access`'s Keycloak Admin client) outside this session's
  `apps/patient-mobile`+`apps/patient-web` scope; flagged here so whoever picks
  it up next doesn't have to rediscover it.
- **Passkey/WebAuthn on Expo/React Native** — flagged as a known risk in
  `claude/solution-architecture-tech-stack.md`. This build did not add a
  native WebAuthn module (a real one would need a config plugin + native
  linking this sandbox can't verify). The concrete, **working** fallback
  implemented instead: `expo-auth-session`'s Authorization Code + PKCE flow
  (real, works today for the eventual Keycloak-hosted login page, which
  itself can offer passkey as the realm's `patient-carer-browser` flow
  already defines) **plus** device-native biometric app-lock via
  `expo-local-authentication` (`lib/auth/biometricLock.ts`, gated in
  `App.tsx`'s `AppLockGate`) as an additional local unlock layer. This
  matches the task brief's instruction to "implement OTP + biometric app-lock
  as the working default either way, and passkey as an enhancement if time
  allows" — the passkey *enhancement* itself (a true in-app WebAuthn
  ceremony) is the piece not built, by design, given the unverifiable native
  module risk.
- **Document vault** — see decision #4 above.
- **Booking's specialist-matching step** (Directory Service auto-assigning a
  `specialistId` to a referral) is out of this session's scope — both booking
  screens handle the "not yet assigned" state honestly rather than assuming
  it.
- **Audit logging**: neither frontend writes directly to the Audit Log
  Service — per root CONVENTIONS.md §7, that's an outbox-pattern
  responsibility of the *backend* service handling each write (e.g.
  `consent-security` for a consent grant/revoke, `gp-authorisation` for an
  approve/decline/revoke). Both apps call those services' real endpoints for
  every consent-relevant action (GP-link approve/decline/revoke, consent
  grant/revoke, passkey revoke) — the audit trail is produced server-side by
  the service that already owns it, not duplicated here.
- **patient-mobile's `expo start`/on-device boot was not exercised** — see
  the Tests section above.

## How to run/test this in isolation

### patient-web

```bash
npm install                                # from monorepo root
cp apps/patient-web/.env.example apps/patient-web/.env.local
npm run dev -w apps/patient-web            # -> http://localhost:3102
npm run typecheck -w apps/patient-web
npm run lint -w apps/patient-web
npm run test -w apps/patient-web
npm run build -w apps/patient-web          # production build — verified passing
```

To exercise the onboarding flow against a running `onboarding-account` service
(port 3002), visit `http://localhost:3102/onboarding/activate?token=<token>`
with a real activation token from `POST /account-activation-requests`.

### patient-mobile

```bash
npm install                                # from monorepo root
cp apps/patient-mobile/.env.example apps/patient-mobile/.env
npm run typecheck -w apps/patient-mobile
npm run lint -w apps/patient-mobile
npm run test -w apps/patient-mobile
npm run start -w apps/patient-mobile       # then press i/a/w in the Expo CLI
```

Physical-device testing note (see `lib/api/config.ts`): override every
`EXPO_PUBLIC_*_URL` in `.env` with your dev machine's LAN IP — `localhost` on a
physical device resolves to the device itself, not your machine.
