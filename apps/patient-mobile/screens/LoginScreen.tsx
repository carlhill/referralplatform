import * as React from 'react';
import { View } from 'react-native';
import { Body, Button, Card, CardTitle, MutedText } from '../components/ui';
import { useNav } from '../lib/nav';
import { useAuth } from '../lib/auth/AuthContext';

export function LoginScreen() {
  const auth = useAuth();
  const { navigate } = useNav();

  React.useEffect(() => {
    if (auth.status === 'authenticated' && !auth.wrongPrincipalType) {
      navigate('home');
    }
  }, [auth.status, auth.wrongPrincipalType]);

  return (
    <View style={{ gap: 16 }}>
      <Card>
        <CardTitle>Sign in to ReferralPlatform</CardTitle>
        <Body>
          Sign in with a passkey (recommended) or your password plus a one-time code. You&apos;ll be guided through
          registering a passkey if you don&apos;t have one yet.
        </Body>
        <Button variant="primary" onPress={() => void auth.login()} disabled={!auth.request}>
          {auth.request ? 'Sign in' : 'Preparing sign-in…'}
        </Button>
      </Card>
      <MutedText>
        New here? Your GP sends a link by text message to set up your account the first time they refer you to a
        specialist.
      </MutedText>
      <Button variant="ghost" onPress={() => navigate('onboarding-token')}>
        Continue setting up a new account
      </Button>
    </View>
  );
}
