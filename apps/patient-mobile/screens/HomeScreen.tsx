import * as React from 'react';
import { Pressable, View } from 'react-native';
import { Body, Button, Card, CardTitle, ErrorState, LoadingState, MutedText, StatusBadge } from '../components/ui';
import { AppShell } from './AppShell';
import { useAuth } from '../lib/auth/AuthContext';
import { useNav } from '../lib/nav';
import { listReferrals } from '../lib/api/referral';
import { listGpLinks } from '../lib/api/gpAuthorisation';
import type { GpLink, Referral } from '../lib/api/types';
import { referralStatusDisplay } from '../lib/ui/status';

function HomeContent() {
  const auth = useAuth();
  const { navigate } = useNav();
  const [referrals, setReferrals] = React.useState<Referral[] | null>(null);
  const [pendingGpLinks, setPendingGpLinks] = React.useState<GpLink[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!auth.accessToken || !auth.principal) return;
    setError(null);
    try {
      const [r, links] = await Promise.all([
        listReferrals(auth.accessToken, { patientId: auth.principal.sub }),
        listGpLinks(auth.accessToken, { patientId: auth.principal.sub, status: 'pending_patient_approval' }),
      ]);
      setReferrals(r);
      setPendingGpLinks(links);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your dashboard.');
    }
  }, [auth.accessToken, auth.principal]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!referrals || !pendingGpLinks) return <LoadingState label="Loading your dashboard…" />;

  const active = referrals.filter((r) => !['completed', 'cancelled', 'lapsed', 'declined'].includes(r.status));

  return (
    <View style={{ gap: 16 }}>
      <Card>
        <CardTitle>Welcome, {auth.principal?.displayName}</CardTitle>
        <Body>
          {active.length === 0
            ? 'You have no active referrals right now.'
            : `You have ${active.length} active referral${active.length === 1 ? '' : 's'}.`}
        </Body>
      </Card>

      {pendingGpLinks.length > 0 && (
        <Card style={{ borderColor: '#f0c37a' }}>
          <CardTitle>Action needed</CardTitle>
          <Body>
            {pendingGpLinks.length} GP{pendingGpLinks.length === 1 ? ' is' : 's are'} waiting for you to approve access
            to your referral history.
          </Body>
          <Button variant="primary" onPress={() => navigate('gp-approvals')}>
            Review requests
          </Button>
        </Card>
      )}

      <Card>
        <CardTitle>Your referrals</CardTitle>
        {referrals.length === 0 ? (
          <MutedText>No referrals yet.</MutedText>
        ) : (
          referrals.slice(0, 5).map((r) => {
            const { label, tone } = referralStatusDisplay(r.status);
            return (
              <Pressable
                key={r.id}
                onPress={() => navigate('referral-detail', { id: r.id })}
                style={{ paddingVertical: 8 }}
              >
                <Body>{r.reasonForReferral.slice(0, 60)}</Body>
                <StatusBadge tone={r.urgent ? 'urgent' : tone} label={r.urgent ? `Urgent · ${label}` : label} />
              </Pressable>
            );
          })
        )}
        <Button variant="ghost" onPress={() => navigate('referrals')}>
          See all referrals
        </Button>
      </Card>
    </View>
  );
}

export function HomeScreen() {
  return (
    <AppShell>
      <HomeContent />
    </AppShell>
  );
}
