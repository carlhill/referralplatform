import * as React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './lib/auth/AuthContext';
import { NavProvider } from './lib/nav';
import { RootRouter } from './screens/RootRouter';
import { AppLockScreen } from './screens/AppLockScreen';
import { promptAppUnlock } from './lib/auth/biometricLock';

/**
 * App-lock gate — the "biometric app-lock" half of this build's "OTP +
 * biometric app-lock as the working default" instruction (see
 * lib/auth/biometricLock.ts's doc comment for the full rationale and the
 * passkey/WebAuthn-on-Expo risk this is the concrete fallback for). Only
 * gates screens once a session exists; unauthenticated flows (onboarding,
 * login) are never locked.
 */
function AppLockGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [unlocked, setUnlocked] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const attemptedForToken = React.useRef<string | null>(null);

  const attemptUnlock = React.useCallback(async () => {
    setError(null);
    const result = await promptAppUnlock();
    if (result.success) {
      setUnlocked(true);
    } else {
      setError(result.error ?? 'Could not verify — try again.');
    }
  }, []);

  React.useEffect(() => {
    if (auth.status !== 'authenticated' || !auth.accessToken) {
      setUnlocked(false);
      attemptedForToken.current = null;
      return;
    }
    if (attemptedForToken.current === auth.accessToken) return;
    attemptedForToken.current = auth.accessToken;
    void attemptUnlock();
  }, [auth.status, auth.accessToken, attemptUnlock]);

  if (auth.status === 'authenticated' && !unlocked) {
    return <AppLockScreen onRetry={attemptUnlock} error={error} />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <AuthProvider>
          <NavProvider initial={{ name: 'home' }}>
            <AppLockGate>
              <RootRouter />
            </AppLockGate>
          </NavProvider>
        </AuthProvider>
        <StatusBar style="auto" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
