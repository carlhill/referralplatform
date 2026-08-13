import * as React from 'react';
import { Pressable, View } from 'react-native';
import { Body, Card, CardTitle, ErrorState, LoadingState, MutedText, StatusBadge } from '../components/ui';
import { AppShell } from './AppShell';
import { useAuth } from '../lib/auth/AuthContext';
import { useNav } from '../lib/nav';
import { listReferrals } from '../lib/api/referral';
import type { Referral } from '../lib/api/types';
import { referralStatusDisplay } from '../lib/ui/status';

function ReferralsContent() {
  const auth = useAuth();
  const { navigate } = useNav();
  const [referrals, setReferrals] = React.useState<Referral[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!auth.accessToken || !auth.principal) return;
    setError(null);
    try {
      setReferrals(await listReferrals(auth.accessToken, { patientId: auth.principal.sub }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your referrals.');
    }
  }, [auth.accessToken, auth.principal]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!referrals) return <LoadingState label="Loading your referrals…" />;

  return (
    <Card>
      <CardTitle>My referrals</CardTitle>
      {referrals.length === 0 ? (
        <MutedText>No referrals yet.</MutedText>
      ) : (
        referrals
          .slice()
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
          .map((r) => {
            const { label, tone } = referralStatusDisplay(r.status);
            return (
              <Pressable
                key={r.id}
                onPress={() => navigate('referral-detail', { id: r.id })}
                style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' }}
              >
                <Body>{r.reasonForReferral.slice(0, 80)}</Body>
                <MutedText>Referred {new Date(r.createdAt).toLocaleDateString('en-AU')}</MutedText>
                <View style={{ marginTop: 4 }}>
                  <StatusBadge tone={r.urgent ? 'urgent' : tone} label={r.urgent ? `Urgent · ${label}` : label} />
                </View>
              </Pressable>
            );
          })
      )}
    </Card>
  );
}

export function ReferralsScreen() {
  return (
    <AppShell>
      <ReferralsContent />
    </AppShell>
  );
}
