import * as React from 'react';
import { View } from 'react-native';
import { Body, Button, Card, CardTitle, ErrorState, Field, MutedText, RadioOption } from '../components/ui';
import { useNav } from '../lib/nav';
import { selectBranch, type CarerRelationship } from '../lib/api/onboarding';
import { ApiError } from '../lib/api/http';

const RELATIONSHIPS: Array<{ value: CarerRelationship; label: string }> = [
  { value: 'parent_guardian', label: 'Parent or guardian' },
  { value: 'adult_child', label: 'Adult child' },
  { value: 'spouse_partner', label: 'Spouse or partner' },
  { value: 'professional_support_worker', label: 'Professional support worker' },
  { value: 'other', label: 'Other' },
];

/**
 * The carer-vs-patient branch — asked neutrally, per
 * identity-security-recommendations.md §3 step 4. When `role === 'carer'`,
 * captures the carer's own name/email/relationship and whether they have a
 * mobile number independent of the patient's (step 6 — the
 * shared-channel-household risk flag).
 */
export function SelectBranchScreen() {
  const { route, navigate } = useNav();
  const token = route.params?.token ?? '';

  const [role, setRole] = React.useState<'patient' | 'carer'>('patient');
  const [givenName, setGivenName] = React.useState('');
  const [familyName, setFamilyName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [relationship, setRelationship] = React.useState<CarerRelationship>('parent_guardian');
  const [sharesPatientMobileNumber, setSharesPatientMobileNumber] = React.useState(true);
  const [ownMobileNumber, setOwnMobileNumber] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await selectBranch(token, {
        role,
        carer:
          role === 'carer'
            ? {
                givenName,
                familyName,
                email,
                relationship,
                sharesPatientMobileNumber,
                ownMobileNumber: sharesPatientMobileNumber ? undefined : ownMobileNumber,
              }
            : undefined,
      });
      navigate('onboarding-otp', { token, role });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong — try again.');
    } finally {
      setBusy(false);
    }
  }

  const carerValid = givenName && familyName && email && (sharesPatientMobileNumber || ownMobileNumber);

  return (
    <View style={{ gap: 16 }}>
      {error && <ErrorState message={error} />}
      <Card>
        <CardTitle>Is this account for you?</CardTitle>
        <RadioOption label="This is for me" selected={role === 'patient'} onPress={() => setRole('patient')} />
        <RadioOption
          label="I'm helping someone else (a carer)"
          selected={role === 'carer'}
          onPress={() => setRole('carer')}
        />
      </Card>

      {role === 'carer' && (
        <Card>
          <CardTitle>About you</CardTitle>
          <Body>Tell us a bit about yourself — this keeps your access separate from the patient&apos;s.</Body>
          <Field label="Your first name" value={givenName} onChangeText={setGivenName} />
          <Field label="Your last name" value={familyName} onChangeText={setFamilyName} />
          <Field
            label="Your email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Body style={{ marginTop: 8 }}>Your relationship to the patient</Body>
          {RELATIONSHIPS.map((r) => (
            <RadioOption
              key={r.value}
              label={r.label}
              selected={relationship === r.value}
              onPress={() => setRelationship(r.value)}
            />
          ))}

          <Body style={{ marginTop: 8 }}>Is the number this text was sent to your own, or the patient&apos;s?</Body>
          <RadioOption
            label="It's the patient's number — I don't have my own on file"
            selected={sharesPatientMobileNumber}
            onPress={() => setSharesPatientMobileNumber(true)}
          />
          <RadioOption
            label="I have my own separate mobile number"
            selected={!sharesPatientMobileNumber}
            onPress={() => setSharesPatientMobileNumber(false)}
          />
          {!sharesPatientMobileNumber && (
            <Field
              label="Your mobile number"
              hint="e.g. 04xx xxx xxx"
              value={ownMobileNumber}
              onChangeText={setOwnMobileNumber}
            />
          )}
          <MutedText>
            You&apos;ll start with everyday-access permissions. Sensitive categories (mental health, sexual health,
            reproductive health, drug &amp; alcohol) stay hidden unless the patient shares them with you.
          </MutedText>
        </Card>
      )}

      <Button variant="primary" onPress={onSubmit} disabled={busy || (role === 'carer' && !carerValid)}>
        {busy ? 'Sending code…' : 'Send me a verification code'}
      </Button>
    </View>
  );
}
