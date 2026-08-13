# patient-mobile

The primary patient/carer surface — Expo/React Native, one codebase for iOS and
Android (see `claude/solution-architecture-tech-stack.md`). Shares TypeScript types
with the backend directly via `@referralplatform/shared-types`.

Screen inventory (implemented — see `claude/ui-design.md` and
`BUILD_LOG/patient-app.md` for the full write-up): Onboarding (SMS-link landing
via `expo-linking`, DOB/Medicare verification, patient-vs-carer branch, carer
detail capture, OTP entry, activation success), Home/dashboard, Referral
detail/timeline with secure message thread, Booking preference capture, New-GP
push-approval, Consent & security (linked-GP revoke, sensitive-category access,
passkey management), Raise a concern, Document vault.

**Passkey/WebAuthn risk flag** (carried over from `claude/solution-architecture-tech-stack.md`):
passkey support on React Native via Expo is still maturing — this build did not add
a native WebAuthn module (see `BUILD_LOG/patient-app.md`, "Known gaps"). The working
fallback implemented here: `expo-auth-session`'s Authorization Code + PKCE flow
against Keycloak (whose hosted login page can itself offer passkey) plus device-native
biometric app-lock via `expo-local-authentication` (`lib/auth/biometricLock.ts`,
gated in `App.tsx`'s `AppLockGate`).

## Run locally

```bash
npm install                       # from monorepo root
cp apps/patient-mobile/.env.example apps/patient-mobile/.env
npm run start -w apps/patient-mobile
# then press `i` (iOS simulator), `a` (Android emulator), or `w` (web) in the Expo CLI,
# or scan the QR code with Expo Go on a physical device.
```

## Test

```bash
npm run test -w apps/patient-mobile        # Jest + jest-expo + @testing-library/react-native
npm run typecheck -w apps/patient-mobile
```

Mobile end-to-end tests use Maestro (see `claude/solution-architecture-tech-stack.md`,
chosen over Detox for lower Expo setup friction) — not yet wired up in this skeleton.

## Note on this build's verification

This app was built and verified (`typecheck`/`lint`/`test` all pass) in a sandboxed
build environment without a simulator/device or the Expo Go/EAS network services
available, so `expo start` and an actual on-device boot were not exercised there —
`npm install`, `tsc --noEmit`, and `jest` (with manual mocks for the native Expo
modules this app depends on — see `jest.setup.ts`) were used as the practical smoke
test instead. Run `npm run start -w apps/patient-mobile` locally to confirm it boots
in Expo Go/a simulator before building on top of it. See `BUILD_LOG/patient-app.md`
for the full list of what's real vs. mocked.
