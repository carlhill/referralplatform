import * as SecureStore from 'expo-secure-store';

/**
 * Token persistence — `expo-secure-store` (iOS Keychain / Android Keystore)
 * rather than `AsyncStorage`, since access/refresh tokens are the one thing
 * in this app that genuinely needs OS-level encrypted-at-rest storage. Web
 * builds (`expo start --web`) fall back to `sessionStorage` since
 * `expo-secure-store` has no web implementation — mirrors
 * apps/patient-web/lib/auth/oidc-client.ts's own storage choice on that
 * platform.
 */
import { Platform } from 'react-native';

const TOKEN_KEY = 'rp_patient_mobile_tokens';

export async function saveTokens(json: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(TOKEN_KEY, json);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, json);
}

export async function loadTokens(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null;
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearTokens(): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
