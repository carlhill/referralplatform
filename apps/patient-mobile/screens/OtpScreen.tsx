import * as React from 'react';
import { View } from 'react-native';
import { Body, Button, Card, CardTitle, ErrorState, Field } from '../components/ui';
import { useNav } from '../lib/nav';
import { resendOtp, verifyOtp } from '../lib/api/onboarding';
import { ApiError } from '../lib/api/http';

export function OtpScreen() {
  const { route, navigate } = useNav();
  const token = route.params?.token ?? '';
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resent, setResent] = React.useState(false);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      const result = await verifyOtp(token, code);
      navigate('onboarding-success', { patientId: result.patientId, role: result.role });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Incorrect code — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    setBusy(true);
    setError(null);
    setResent(false);
    try {
      await resendOtp(token);
      setResent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resend the code — try again shortly.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      {error && <ErrorState message={error} />}
      <Card>
        <CardTitle>Enter your verification code</CardTitle>
        <Body>We&apos;ve emailed you a 6-digit code.</Body>
        {resent && <Body>A new code has been sent.</Body>}
        <Field
          label="Verification code"
          hint="6 digits"
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
        />
        <Button variant="primary" onPress={onSubmit} disabled={busy || code.length !== 6}>
          {busy ? 'Verifying…' : 'Activate my account'}
        </Button>
        <Button variant="ghost" onPress={onResend} disabled={busy}>
          Resend code
        </Button>
      </Card>
    </View>
  );
}
