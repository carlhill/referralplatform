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
import { useNav } from '../lib/nav';
import { cancelReferral, getComplianceFlags, getReferral } from '../lib/api/referral';
import { createOrGetThread, listMessages, postMessage } from '../lib/api/notification';
import type { ComplianceFlag, Referral, ThreadMessage } from '../lib/api/types';
import { referralStatusDisplay } from '../lib/ui/status';

interface TimelineEvent {
  label: string;
  at: string;
}

function buildTimeline(r: Referral): TimelineEvent[] {
  const events: TimelineEvent[] = [{ label: 'Referral created by your GP', at: r.createdAt }];
  if (r.routedAt) events.push({ label: 'Sent to the specialist', at: r.routedAt });
  if (r.reviewStartedAt) events.push({ label: 'Specialist started reviewing', at: r.reviewStartedAt });
  if (r.bookedAt) events.push({ label: 'Appointment booked', at: r.bookedAt });
  if (r.resolvedEconsultAt) events.push({ label: 'Resolved without an appointment', at: r.resolvedEconsultAt });
  if (r.completedAt) events.push({ label: 'Completed', at: r.completedAt });
  if (r.declinedAt) events.push({ label: 'Declined by the specialist', at: r.declinedAt });
  if (r.cancelledAt) events.push({ label: 'Cancelled', at: r.cancelledAt });
  if (r.lapsedAt) events.push({ label: 'Activation window lapsed', at: r.lapsedAt });
  return events.sort((a, b) => (a.at < b.at ? -1 : 1));
}

function MessageThreadPanel({ referralId }: { referralId: string }) {
  const auth = useAuth();
  const [threadId, setThreadId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ThreadMessage[] | null>(null);
  const [draft, setDraft] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!auth.accessToken) return;
    setError(null);
    try {
      const thread = await createOrGetThread(auth.accessToken, referralId);
      setThreadId(thread.id);
      setMessages(await listMessages(auth.accessToken, thread.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load messages.');
    }
  }, [auth.accessToken, referralId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function onSend() {
    if (!auth.accessToken || !threadId || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      await postMessage(auth.accessToken, threadId, draft.trim());
      setDraft('');
      setMessages(await listMessages(auth.accessToken, threadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your message.');
    } finally {
      setSending(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!messages) return <LoadingState label="Loading messages…" />;

  return (
    <View style={{ gap: 8 }}>
      {messages.length === 0 ? (
        <MutedText>No messages yet.</MutedText>
      ) : (
        messages.map((m) => (
          <View key={m.id} style={{ padding: 8, borderRadius: 8, backgroundColor: '#f4f6f7' }}>
            <MutedText>{m.senderDisplayName ?? m.senderType}</MutedText>
            <Body>{m.body}</Body>
            <MutedText>{new Date(m.createdAt).toLocaleString('en-AU')}</MutedText>
          </View>
        ))
      )}
      <Field label="Message" value={draft} onChangeText={setDraft} placeholder="Send a secure message…" />
      <Button variant="primary" onPress={onSend} disabled={sending || !draft.trim()}>
        Send
      </Button>
    </View>
  );
}

function ReferralDetailContent({ id }: { id: string }) {
  const auth = useAuth();
  const { navigate } = useNav();
  const [referral, setReferral] = React.useState<Referral | null>(null);
  const [flags, setFlags] = React.useState<ComplianceFlag[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [cancelling, setCancelling] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!auth.accessToken) return;
    setError(null);
    try {
      const [r, f] = await Promise.all([getReferral(auth.accessToken, id), getComplianceFlags(auth.accessToken, id)]);
      setReferral(r);
      setFlags(f);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this referral.');
    }
  }, [auth.accessToken, id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function onCancel() {
    if (!auth.accessToken) return;
    setCancelling(true);
    try {
      await cancelReferral(auth.accessToken, id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel this referral.');
    } finally {
      setCancelling(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!referral || !flags) return <LoadingState label="Loading referral…" />;

  const { label, tone } = referralStatusDisplay(referral.status);
  const canBook = ['routed', 'in_review'].includes(referral.status);
  const canCancel = !['completed', 'cancelled', 'declined', 'lapsed'].includes(referral.status);

  return (
    <View style={{ gap: 16 }}>
      <Card>
        <CardTitle>Referral detail</CardTitle>
        <Body>{referral.reasonForReferral}</Body>
        <StatusBadge tone={referral.urgent ? 'urgent' : tone} label={referral.urgent ? `Urgent · ${label}` : label} />
        {canBook && (
          <Button variant="primary" onPress={() => navigate('booking', { id })}>
            Set booking preferences
          </Button>
        )}
      </Card>

      <Card>
        <CardTitle>Timeline</CardTitle>
        {buildTimeline(referral).map((event, idx) => (
          <View key={idx} style={{ paddingVertical: 4 }}>
            <Body>{event.label}</Body>
            <MutedText>{new Date(event.at).toLocaleString('en-AU')}</MutedText>
          </View>
        ))}
      </Card>

      <Card>
        <CardTitle>Messages</CardTitle>
        <MessageThreadPanel referralId={id} />
      </Card>

      {canCancel && (
        <Card>
          <CardTitle>Cancel this referral</CardTitle>
          <Button variant="secondary" onPress={onCancel} disabled={cancelling}>
            {cancelling ? 'Cancelling…' : 'Cancel referral'}
          </Button>
        </Card>
      )}
    </View>
  );
}

export function ReferralDetailScreen({ id }: { id: string }) {
  return (
    <AppShell>
      <ReferralDetailContent id={id} />
    </AppShell>
  );
}
