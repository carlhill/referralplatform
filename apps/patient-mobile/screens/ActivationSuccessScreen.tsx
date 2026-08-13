import * as React from 'react';
import { View } from 'react-native';
import { Body, Button, Card, CardTitle, MutedText, StatusBadge } from '../components/ui';
import { useNav } from '../lib/nav';
import { useAuth } from '../lib/auth/AuthContext';
import { getBiometricAvailability } from '../lib/auth/biometricLock';

export function ActivationSuccessScreen() {
  const { route, navigate } = useNav();
  const auth = useAuth();
  const patientId = route.params?.patientId ?? '';
  const role = (route.params?.role as 'patient' | 'carer') ?? 'patient';
  const [biometricAvailable, setBiometricAvailable] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    getBiometricAvailability().then((a) => setBiometricAvailable(a.hasHardware && a.isEnrolled));
  }, []);

  async function onContinue() {
    await auth.startLocalActivationSession(patientId, role);
    navigate('home');
  }

  return (
    <View style={{ gap: 16 }}>
      <Card>
        <StatusBadge tone="success" label="Account activated" />
        <CardTitle>You&apos;re all set</CardTitle>
        <Body>
          Any referral your GP already sent is being routed to the specialist now. From the Consent &amp; security
          screen you can set up a passkey (fast, secure sign-in with your device&apos;s fingerprint, face, or screen
          lock) — or keep using a password and a one-time code for now.
        </Body>
        {biometricAvailable === true && (
          <MutedText>
            This device supports biometric app-lock — ReferralPlatform will ask for it each time you open the app, on
            top of your sign-in.
          </MutedText>
        )}
        {biometricAvailable === false && (
          <MutedText>
            No biometric lock is set up on this device — you can still use ReferralPlatform with your regular sign-in.
          </MutedText>
        )}
        <Button variant="primary" onPress={onContinue}>
          Continue to my account
        </Button>
      </Card>
    </View>
  );
}
