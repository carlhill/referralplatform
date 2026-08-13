import * as React from 'react';
import { View } from 'react-native';
import {
  Body,
  Button,
  Card,
  CardTitle,
  ErrorState,
  Field,
  LoadingState,
  MutedText,
  StatusBadge,
} from '../components/ui';
import { AppShell } from './AppShell';
import { useAuth } from '../lib/auth/AuthContext';
import { approveGpLink, declineGpLink, listGpLinks } from '../lib/api/gpAuthorisation';
import type { GpLink } from '../lib/api/types';
import { gpLinkStatusDisplay } from '../lib/ui/status';

function GpApprovalsContent() {
  const auth = useAuth();
  const [links, setLinks] = React.useState<GpLink[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [declineReason, setDeclineReason] = React.useState<Record<string, string>>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!auth.accessToken || !auth.principal) return;
    setError(null);
    try {
      setLinks(await listGpLinks(auth.accessToken, { patientId: auth.principal.sub }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load GP requests.');
    }
  }, [auth.accessToken, auth.principal]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function onApprove(id: string) {
    if (!auth.accessToken) return;
    setBusyId(id);
    setError(null);
    try {
      await approveGpLink(auth.accessToken, id);
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} — if this mentions step-up/passkey, sign in again with your passkey and retry.`
          : 'Could not approve this request.',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onDecline(id: string) {
    if (!auth.accessToken) return;
    setBusyId(id);
    setError(null);
    try {
      await declineGpLink(auth.accessToken, id, declineReason[id]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not decline this request.');
    } finally {
      setBusyId(null);
    }
  }

  if (error && !links) return <ErrorState message={error} onRetry={load} />;
  if (!links) return <LoadingState label="Loading GP requests…" />;

  const pending = links.filter((l) => l.status === 'pending_patient_approval');
  const decided = links.filter((l) => l.status !== 'pending_patient_approval');

  return (
    <View style={{ gap: 16 }}>
      {error && <ErrorState message={error} />}
      <Card>
        <CardTitle>GPs asking to access your referrals</CardTitle>
        {pending.length === 0 ? (
          <MutedText>No pending requests right now.</MutedText>
        ) : (
          pending.map((link) => (
            <View key={link.id} style={{ borderTopWidth: 1, borderTopColor: '#eee', paddingVertical: 12, gap: 8 }}>
              <Body>
                GP {link.gpId} at practice {link.practiceHpiO}
              </Body>
              {link.urgentEscalation ? (
                <StatusBadge tone="urgent" label="Urgent — access already granted, for your records" />
              ) : (
                <>
                  <Button variant="primary" onPress={() => onApprove(link.id)} disabled={busyId === link.id}>
                    Approve
                  </Button>
                  <Field
                    label="Reason if declining (optional)"
                    value={declineReason[link.id] ?? ''}
                    onChangeText={(v) => setDeclineReason((prev) => ({ ...prev, [link.id]: v }))}
                  />
                  <Button variant="secondary" onPress={() => onDecline(link.id)} disabled={busyId === link.id}>
                    Decline
                  </Button>
                </>
              )}
            </View>
          ))
        )}
      </Card>

      {decided.length > 0 && (
        <Card>
          <CardTitle>Past decisions</CardTitle>
          {decided.map((link) => {
            const { label, tone } = gpLinkStatusDisplay(link.status);
            return (
              <View key={link.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                <Body>GP {link.gpId}</Body>
                <StatusBadge tone={tone} label={label} />
              </View>
            );
          })}
        </Card>
      )}
    </View>
  );
}

export function GpApprovalsScreen() {
  return (
    <AppShell>
      <GpApprovalsContent />
    </AppShell>
  );
}
