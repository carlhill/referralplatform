'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, CardBody, CardHeader, CardTitle, FormField, StatusBadge } from '@referralplatform/ui-components';
import { RequireAuth } from '../../../components/RequireAuth';
import { LoadingState } from '../../../components/LoadingState';
import { ErrorState } from '../../../components/ErrorState';
import { useAuth } from '../../../lib/auth/AuthContext';
import { cancelReferral, getComplianceFlags, getReferral } from '../../../lib/api/referral';
import { createOrGetThread, listMessages, postMessage } from '../../../lib/api/notification';
import type { ComplianceFlag, Referral, ThreadMessage } from '../../../lib/api/types';
import { referralStatusDisplay } from '../../../lib/ui/status';

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
  if (r.declinedAt)
    events.push({
      label: `Declined by the specialist${r.declinedReason ? `: ${r.declinedReason}` : ''}`,
      at: r.declinedAt,
    });
  if (r.cancelledAt)
    events.push({ label: `Cancelled${r.cancelledReason ? `: ${r.cancelledReason}` : ''}`, at: r.cancelledAt });
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

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
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
    <div>
      {messages.length === 0 ? (
        <p style={{ color: 'var(--rp-color-text-muted)' }}>No messages yet.</p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--rp-space-2)',
          }}
        >
          {messages.map((m) => (
            <li
              key={m.id}
              style={{
                padding: 'var(--rp-space-2)',
                borderRadius: 'var(--rp-radius-md)',
                background:
                  m.senderType === 'patient' || m.senderType === 'carer'
                    ? 'var(--rp-color-primary-600)'
                    : 'var(--rp-color-bg-subtle)',
                color:
                  m.senderType === 'patient' || m.senderType === 'carer'
                    ? 'var(--rp-color-text-inverse)'
                    : 'var(--rp-color-text)',
              }}
            >
              <div style={{ fontSize: 'var(--rp-font-size-sm)', fontWeight: 'var(--rp-font-weight-bold)' }}>
                {m.senderDisplayName ?? m.senderType}
              </div>
              <div>{m.body}</div>
              <div style={{ fontSize: 'var(--rp-font-size-sm)', opacity: 0.8 }}>
                {new Date(m.createdAt).toLocaleString('en-AU')}
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onSend} style={{ display: 'flex', gap: 'var(--rp-space-2)', marginTop: 'var(--rp-space-3)' }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Send a secure message about this referral…"
          style={{ flex: 1 }}
          aria-label="Message"
        />
        <Button type="submit" variant="primary" disabled={sending || !draft.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}

function ReferralDetail({ id }: { id: string }) {
  const auth = useAuth();
  const [referral, setReferral] = React.useState<Referral | null>(null);
  const [flags, setFlags] = React.useState<ComplianceFlag[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [cancelReason, setCancelReason] = React.useState('');
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
      await cancelReferral(auth.accessToken, id, cancelReason || undefined);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-4)' }}>
      <Card>
        <CardHeader>
          <CardTitle>Referral detail</CardTitle>
        </CardHeader>
        <CardBody>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 'var(--rp-space-3)',
            }}
          >
            <p style={{ margin: 0, maxWidth: 480 }}>{referral.reasonForReferral}</p>
            <StatusBadge
              tone={referral.urgent ? 'urgent' : tone}
              label={referral.urgent ? `Urgent · ${label}` : label}
            />
          </div>
          {referral.queueExpiresAt && referral.status === 'queued' && (
            <p style={{ marginTop: 'var(--rp-space-2)', fontSize: 'var(--rp-font-size-sm)' }}>
              This referral will be sent as soon as your account finishes setting up, and must complete by{' '}
              {new Date(referral.queueExpiresAt).toLocaleString('en-AU')}.
            </p>
          )}
          <div style={{ display: 'flex', gap: 'var(--rp-space-2)', marginTop: 'var(--rp-space-3)' }}>
            {canBook && (
              <Button asChild variant="primary">
                <Link href={`/referrals/${id}/booking`}>Set booking preferences</Link>
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardBody>
          <ol style={{ margin: 0, paddingLeft: 'var(--rp-space-4)' }}>
            {buildTimeline(referral).map((event, idx) => (
              <li key={idx} style={{ marginBottom: 'var(--rp-space-2)' }}>
                <strong>{event.label}</strong>
                <br />
                <span style={{ fontSize: 'var(--rp-font-size-sm)', color: 'var(--rp-color-text-muted)' }}>
                  {new Date(event.at).toLocaleString('en-AU')}
                </span>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      {flags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Compliance checklist items on this referral</CardTitle>
          </CardHeader>
          <CardBody>
            <ul>
              {flags.map((f) => (
                <li key={f.id}>
                  {f.category.replace(/_/g, ' ')} ({f.jurisdiction}) —{' '}
                  {f.checklistAcknowledgedAt ? 'acknowledged by your GP' : 'pending acknowledgement'}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
        </CardHeader>
        <CardBody>
          <MessageThreadPanel referralId={id} />
        </CardBody>
      </Card>

      {canCancel && (
        <Card>
          <CardHeader>
            <CardTitle>Cancel this referral</CardTitle>
          </CardHeader>
          <CardBody>
            <FormField id="cancelReason" label="Reason (optional)">
              <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
            </FormField>
            <Button variant="secondary" onClick={onCancel} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : 'Cancel referral'}
            </Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export default function ReferralDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <RequireAuth>
      <ReferralDetail id={params.id} />
    </RequireAuth>
  );
}
