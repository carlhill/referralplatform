import * as React from 'react';
import { View } from 'react-native';
import {
  Body,
  Button,
  Card,
  CardTitle,
  Checkbox,
  ErrorState,
  Field,
  LoadingState,
  MutedText,
  StatusBadge,
} from '../components/ui';
import { AppShell } from './AppShell';
import { useAuth } from '../lib/auth/AuthContext';
import { listConcerns, raiseConcern } from '../lib/api/consentSecurity';
import type { Concern } from '../lib/api/types';
import { concernStatusDisplay } from '../lib/ui/status';

function ConcernContent() {
  const auth = useAuth();
  const [summary, setSummary] = React.useState('');
  const [aboutCare, setAboutCare] = React.useState(false);
  const [aboutPlatform, setAboutPlatform] = React.useState(false);
  const [aboutPrivacy, setAboutPrivacy] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState<Concern | null>(null);
  const [past, setPast] = React.useState<Concern[] | null>(null);
  const [pastError, setPastError] = React.useState<string | null>(null);

  const loadPast = React.useCallback(async () => {
    if (!auth.accessToken || !auth.principal) return;
    setPastError(null);
    try {
      setPast(await listConcerns(auth.accessToken, auth.principal.sub));
    } catch (err) {
      setPastError(err instanceof Error ? err.message : 'Could not load your past concerns.');
    }
  }, [auth.accessToken, auth.principal]);

  React.useEffect(() => {
    void loadPast();
  }, [loadPast]);

  async function onSubmit() {
    if (!auth.accessToken || !auth.principal) return;
    if (!aboutCare && !aboutPlatform && !aboutPrivacy) {
      setSubmitError('Select at least one option describing what this is about.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const concern = await raiseConcern(auth.accessToken, {
        patientId: auth.principal.sub,
        summary,
        isAboutHowCareWasHandled: aboutCare,
        isAboutSomethingNotWorkingOnThePlatform: aboutPlatform,
        isAboutSomeoneSeeingSomethingTheyShouldnt: aboutPrivacy,
      });
      setSubmitted(concern);
      setSummary('');
      setAboutCare(false);
      setAboutPlatform(false);
      setAboutPrivacy(false);
      await loadPast();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not submit your concern — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <Card>
        <CardTitle>Raise a concern</CardTitle>
        {submitted && <StatusBadge tone="success" label="Concern submitted" />}
        {submitError && <ErrorState message={submitError} />}
        <Body>What is this about? (select all that apply)</Body>
        <Checkbox
          label="How my care was handled by a doctor"
          checked={aboutCare}
          onPress={() => setAboutCare((v) => !v)}
        />
        <Checkbox
          label="Something not working properly on ReferralPlatform"
          checked={aboutPlatform}
          onPress={() => setAboutPlatform((v) => !v)}
        />
        <Checkbox
          label="Someone seeing something about me they shouldn't have"
          checked={aboutPrivacy}
          onPress={() => setAboutPrivacy((v) => !v)}
        />
        <Field label="Tell us what happened" value={summary} onChangeText={setSummary} multiline numberOfLines={4} />
        <Button variant="primary" onPress={onSubmit} disabled={submitting || summary.length < 5}>
          {submitting ? 'Submitting…' : 'Submit'}
        </Button>
      </Card>

      <Card>
        <CardTitle>Your past concerns</CardTitle>
        {pastError && <ErrorState message={pastError} onRetry={loadPast} />}
        {!past && !pastError && <LoadingState label="Loading…" />}
        {past && past.length === 0 && <MutedText>None yet.</MutedText>}
        {past &&
          past.map((c) => {
            const { label, tone } = concernStatusDisplay(c.status);
            return (
              <View key={c.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                <Body>{c.summary.slice(0, 60)}</Body>
                <StatusBadge tone={tone} label={label} />
              </View>
            );
          })}
      </Card>
    </View>
  );
}

export function ConcernScreen() {
  return (
    <AppShell>
      <ConcernContent />
    </AppShell>
  );
}
