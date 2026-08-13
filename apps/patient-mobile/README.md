# patient-mobile

The primary patient/carer surface — Expo/React Native, one codebase for iOS and
Android (see `claude/solution-architecture-tech-stack.md`). Shares TypeScript types
with the backend directly via `@referralplatform/shared-types`.

Screen inventory (not yet implemented — see `claude/ui-design.md`): Onboarding
(SMS-link landing, DOB/Medicare verification, patient-vs-carer branch, OTP entry,
passkey enrolment), Home/dashboard, Referral detail/timeline, Booking, New GP
approval, Consent & security, Raise a concern, Document vault.

**Passkey/WebAuthn risk flag** (carried over from `claude/solution-architecture-tech-stack.md`):
passkey support on React Native via Expo is still maturing — validate the platform-native
passkey APIs work acceptably early, with a fallback to OTP + device biometric app-lock.

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

## Note on this skeleton's verification

This app was scaffolded and typechecked in a sandboxed build environment without a
simulator/device or the Expo Go/EAS network services available, so `expo start` and an
actual on-device boot were not exercised there — `npm install` and `tsc --noEmit`
were used as the practical smoke test instead. Run `npm run start -w apps/patient-mobile`
locally to confirm it boots in Expo Go/a simulator before building on top of it.
