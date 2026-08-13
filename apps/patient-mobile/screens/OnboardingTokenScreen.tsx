import * as React from 'react';
import * as Linking from 'expo-linking';
import { View } from 'react-native';
import { Body, Button, Card, CardTitle, Field, MutedText } from '../components/ui';
import { useNav } from '../lib/nav';

/**
 * Landing screen for the SMS-link onboarding flow (identity-security-
 * recommendations.md §3). Real deep-link handling via `expo-linking`
 * (`referralplatform://activate?token=...` or the universal-link
 * equivalent once one exists) plus a manual paste fallback for local dev,
 * since no physical device/simulator is available to verify a real deep
 * link tap in this build's sandbox — see BUILD_LOG/patient-app.md.
 */
export function OnboardingTokenScreen() {
  const { navigate } = useNav();
  const [token, setToken] = React.useState('');

  React.useEffect(() => {
    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) applyUrl(initialUrl);
    });
    const sub = Linking.addEventListener('url', (event) => applyUrl(event.url));
    return () => sub.remove();
  }, []);

  function applyUrl(url: string) {
    try {
      const parsed = Linking.parse(url);
      const t = parsed.queryParams?.token;
      if (typeof t === 'string' && t.length > 0) {
        setToken(t);
      }
    } catch {
      // Malformed URL — ignore, user can paste the token manually below.
    }
  }

  function extractToken(input: string): string {
    const match = input.match(/[?&]token=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : input.trim();
  }

  return (
    <View style={{ gap: 16 }}>
      <Card>
        <CardTitle>Set up your ReferralPlatform account</CardTitle>
        <Body>
          Your GP&apos;s text message included a link. If you tapped it on this device, the code below should already be
          filled in — otherwise paste the link (or just the code) here.
        </Body>
        <Field
          label="Activation link or code"
          value={token}
          onChangeText={(v) => setToken(extractToken(v))}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Paste your activation link"
        />
        <Button variant="primary" onPress={() => navigate('onboarding-verify-identity', { token })} disabled={!token}>
          Continue
        </Button>
      </Card>
      <MutedText>Already have an account? Use the sign-in screen instead.</MutedText>
      <Button variant="ghost" onPress={() => navigate('login')}>
        Go to sign in
      </Button>
    </View>
  );
}
