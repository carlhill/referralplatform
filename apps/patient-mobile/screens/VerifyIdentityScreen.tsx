import * as React from 'react';
import { View } from 'react-native';
import { Body, Button, Card, CardTitle, ErrorState, Field } from '../components/ui';
import { useNav } from '../lib/nav';
import { verifyIdentity } from '../lib/api/onboarding';
import { ApiError } from '../lib/api/http';

export function VerifyIdentityScreen() {
  const { route, navigate } = useNav();
  const token = route.params?.token ?? '';
  const [dateOfBirth, setDateOfBirth] = React.useState('');
  const [medicareNumber, setMedicareNumber] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await verifyIdentity(token, { dateOfBirth, medicareNumber: medicareNumber || undefined });
      navigate('onboarding-branch', { token });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not verify your details — check them and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      {error && <ErrorState message={error} />}
      <Card>
        <CardTitle>Confirm it&apos;s you</CardTitle>
        <Body>First, confirm a couple of details your GP already has on file.</Body>
        <Field
          label="Date of birth"
          hint="YYYY-MM-DD"
          value={dateOfBirth}
          onChangeText={setDateOfBirth}
          placeholder="1985-06-21"
          keyboardType="numbers-and-punctuation"
        />
        <Field
          label="Medicare number (optional)"
          hint="10 digits, if your GP recorded one"
          value={medicareNumber}
          onChangeText={setMedicareNumber}
          keyboardType="number-pad"
          maxLength={10}
        />
        <Button variant="primary" onPress={onSubmit} disabled={busy || dateOfBirth.length < 8}>
          {busy ? 'Checking…' : 'Continue'}
        </Button>
      </Card>
    </View>
  );
}
