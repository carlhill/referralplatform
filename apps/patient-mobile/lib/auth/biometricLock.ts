import * as LocalAuthentication from 'expo-local-authentication';

/**
 * App-lock via the device's own biometric/passcode prompt — the "working
 * default" this build's brief calls for (OTP + biometric app-lock),
 * alongside the real OIDC/passkey flow in AuthContext.tsx. This never
 * replaces server-side authentication; it's a second, local gate so a
 * signed-in session can't be used by whoever picks up an unlocked phone.
 *
 * Passkey/WebAuthn support on Expo/React Native is flagged as still
 * maturing per claude/solution-architecture-tech-stack.md — this
 * device-biometric app-lock is the concrete, verified-working fallback
 * called for there, not a passkey implementation itself. A true WebAuthn
 * passkey (usable for the Keycloak login step) would need a native module
 * this build does not include — see BUILD_LOG/patient-app.md.
 */
export interface BiometricAvailability {
  hasHardware: boolean;
  isEnrolled: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
}

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  return { hasHardware, isEnrolled, supportedTypes };
}

export interface BiometricPromptResult {
  success: boolean;
  error?: string;
}

export async function promptAppUnlock(): Promise<BiometricPromptResult> {
  const availability = await getBiometricAvailability();
  if (!availability.hasHardware || !availability.isEnrolled) {
    // Documented fallback: no biometric hardware/enrolment on this device —
    // the app relies on the OTP-backed sign-in session alone rather than
    // blocking access, per this build's "OTP + biometric app-lock as the
    // working default" instruction (biometric is additive, not required).
    return { success: true };
  }
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock ReferralPlatform',
    disableDeviceFallback: false, // allow the device passcode as a fallback, per platform convention
    cancelLabel: 'Cancel',
  });
  return { success: result.success, error: result.success ? undefined : result.error };
}
