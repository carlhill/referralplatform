'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, CardBody, CardHeader, CardTitle, StatusBadge } from '@referralplatform/ui-components';
import { useRequireGp } from '../../../lib/auth/useRequireGp';
import { LoadingState } from '../../../components/LoadingState';
import { ErrorState } from '../../../components/ErrorState';
import { ApiError } from '../../../lib/api/http';
import { acknowledgeComplianceFlag, cancelReferral, getComplianceFlags, getReferral } from '../../../lib/api/referral';
import { createOrGetThread, listMessages, listThreadsForReferral, postMessage, resolveThread } from '../../../lib/api/notification';
import type { ComplianceFlag, MessageThread, Referral, ThreadMessage } from '../../../lib/api/types';
import { referralStatusDisplay } from '../../../lib/ui/referralStatus';

function MessageThreadPanel({ referralId, token }: { referralId: string; token: string }) {
  const [thread, setThread] = React.useState<MessageThread | null>(null);
  const [messages, setMessages] = React.useState<ThreadMessage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const existing = await listThreadsForReferral(token, referralId);
      const t = existing[0] ?? null;
      setThread(t);
      if (t) setMessages(await listMessages(token, t.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the message thread.');
    } finally {
      setLoading(false);
    }
  }, [token, referralId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function onStartThread() {
    setError(null);
    try {
      const t = await createOrGetThread(token, referralId, {});
      setThread(t);
      setMessages(await listMessages(token, t.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start a message thread.');
    }
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!thread || !draft.trim()) return;
    setSending(true);
    try {
      const msg = await postMessage(token, thread.id, draft.trim());
      setMessages((m) => [...m, msg]);
      setDraft('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send this message.');
    } finally {
      setSending(false);
    }
  }

  async function onResolve() {
    if (!thread) return;
    try {
      const updated = await resolveThread(token, thread.id);
      setThread(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resolve this thread.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Message thread</CardTitle>
      </CardHeader>
      <CardBody>
        {error && <ErrorState message={error} onRetry={() => void load()} />}
        {loading ? (
          <LoadingState label="Loading messages…" />
        ) : !thread ? (
          <>
            <p>No message thread yet for this referral.</p>
            <Button variant="secondary" onClick={onStartThread}>
              Start thread
            </Button>
          </>
        ) : (
          <>
            <StatusBadge tone={thread.status === 'resolved' ? 'success' : 'neutral'} label={thread.status} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-2)', margin: 'var(--rp-space-3) 0' }}>
              {messages.length === 0 && <p style={{ color: 'var(--rp-color-text-muted)' }}>No messages yet.</p>}
              {messages.map((m) => (
                <div key={m.id} style={{ borderBottom: '1px solid var(--rp-color-border)', paddingBottom: 'var(--rp-space-2)' }}>
                  <p style={{ margin: 0, fontSize: 'var(--rp-font-size-sm)', color: 'var(--rp-color-text-muted)' }}>
                    {m.senderDisplayName ?? m.senderId} ({m.senderType}) — {new Date(m.createdAt).toLocaleString()}
                  </p>
                  <p style={{ margin: 0 }}>{m.body}</p>
                </div>
              ))}
            </div>
            {thread.status !== 'resolved' && (
              <>
                <form onSubmit={onSend} style={{ display: 'flex', gap: 'var(--rp-space-2)' }}>
                  <input
                    aria-label="New message"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    style={{ flex: 1 }}
                    placeholder="Write a message…"
                  />
                  <Button type="submit" variant="primary" disabled={sending || !draft.trim()}>
                    Send
                  </Button>
                </form>
                <Button variant="ghost" onClick={onResolve} style={{ marginTop: 'var(--rp-space-2)' }}>
                  Mark resolved
                </Button>
              </>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function ComplianceFlagsPanel({
  referralId,
  token,
}: {
  referralId: string;
  token: string;
}) {
  const [flags, setFlags] = React.useState<ComplianceFlag[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    try {
      setFlags(await getComplianceFlags(token, referralId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load compliance flags.');
    }
  }, [token, referralId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function onAcknowledge(flagId: string) {
    try {
      const updated = await acknowledgeComplianceFlag(token, referralId, flagId, notes[flagId]);
      setFlags((fs) => (fs ? fs.map((f) => (f.id === flagId ? updated : f)) : fs));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not acknowledge this flag.');
    }
  }

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!flags) return <LoadingState label="Loading compliance flags…" />;
  if (flags.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compliance checklist</CardTitle>
      </CardHeader>
      <CardBody>
        {flags.map((flag) => (
          <div key={flag.id} style={{ borderTop: '1px solid var(--rp-color-border)', paddingTop: 'var(--rp-space-2)', marginTop: 'var(--rp-space-2)' }}>
            <p style={{ margin: 0 }}>
              <strong>{flag.category.replace(/_/g, ' ')}</strong> ({flag.jurisdiction}, v{flag.rulesetVersion}) —{' '}
              {flag.checklistAcknowledgedAt ? (
                <StatusBadge tone="success" label={`Acknowledged ${new Date(flag.checklistAcknowledgedAt).toLocaleString()}`} />
              ) : (
                <StatusBadge tone="attention" label="Not yet acknowledged" />
              )}
            </p>
            {flag.acknowledgementNote && <p style={{ margin: 0, color: 'var(--rp-color-text-muted)' }}>Note: {flag.acknowledgementNote}</p>}
            {!flag.checklistAcknowledgedAt && (
              <div style={{ display: 'flex', gap: 'var(--rp-space-2)', marginTop: 'var(--rp-space-2)' }}>
                <input
                  aria-label={`Note for ${flag.category}`}
                  value={notes[flag.id] ?? ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [flag.id]: e.target.value }))}
                  placeholder="Optional note"
                  style={{ flex: 1 }}
                />
                <Button variant="secondary" onClick={() => onAcknowledge(flag.id)}>
                  Acknowledge
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

export default function ReferralDetailPage() {
  const auth = useRequireGp();
  const params = useParams<{ id: string }>();
  const referralId = params.id;

  const [referral, setReferral] = React.useState<Referral | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [cancelReason, setCancelReason] = React.useState('');
  const [cancelling, setCancelling] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!auth.accessToken) return;
    setLoading(true);
    setError(null);
    try {
      setReferral(await getReferral(auth.accessToken, referralId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this referral.');
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken, referralId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function onCancel() {
    if (!auth.accessToken) return;
    setCancelling(true);
    try {
      const updated = await cancelReferral(auth.accessToken, referralId, cancelReason || undefined);
      setReferral(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel this referral.');
    } finally {
      setCancelling(false);
    }
  }

  if (auth.status !== 'authenticated' || !auth.accessToken) return <LoadingState label="Signing you in…" />;
  if (loading) return <LoadingState label="Loading referral…" />;
  if (error && !referral) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!referral) return null;

  const { label, tone } = referralStatusDisplay(referral.status);
  const cancellable = !['completed', 'cancelled', 'declined', 'lapsed'].includes(referral.status);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-4)' }}>
      <div>
        <StatusBadge tone={tone} label={label} />
        {referral.urgent && <StatusBadge tone="urgent" label="Urgent" style={{ marginLeft: 'var(--rp-space-2)' }} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Referral {referral.id}</CardTitle>
        </CardHeader>
        <CardBody>
          <dl style={{ display: 'grid', gridTemplateColumns: '200px 1fr', rowGap: 'var(--rp-space-1)' }}>
            <dt>Patient</dt>
            <dd>{referral.patientId}</dd>
            <dt>Referring GP</dt>
            <dd>{referral.gpId}</dd>
            <dt>Specialist</dt>
            <dd>{referral.specialistId ?? '—'}</dd>
            <dt>Origin</dt>
            <dd>{referral.origin}</dd>
            <dt>Reason</dt>
            <dd>{referral.reasonForReferral}</dd>
            <dt>Created</dt>
            <dd>{new Date(referral.createdAt).toLocaleString()}</dd>
            {referral.queueExpiresAt && (
              <>
                <dt>Activation-queue expires</dt>
                <dd>{new Date(referral.queueExpiresAt).toLocaleString()}</dd>
              </>
            )}
            {referral.declinedReason && (
              <>
                <dt>Decline reason</dt>
                <dd>{referral.declinedReason}</dd>
              </>
            )}
            {referral.cancelledReason && (
              <>
                <dt>Cancellation reason</dt>
                <dd>{referral.cancelledReason}</dd>
              </>
            )}
          </dl>

          {cancellable && (
            <div style={{ marginTop: 'var(--rp-space-3)', borderTop: '1px solid var(--rp-color-border)', paddingTop: 'var(--rp-space-3)' }}>
              <input
                aria-label="Cancellation reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancelling (optional)"
                style={{ marginRight: 'var(--rp-space-2)' }}
              />
              <Button variant="urgent" onClick={onCancel} disabled={cancelling}>
                {cancelling ? 'Cancelling…' : 'Cancel referral'}
              </Button>
            </div>
          )}
          {error && <ErrorState message={error} />}
        </CardBody>
      </Card>

      <ComplianceFlagsPanel referralId={referral.id} token={auth.accessToken} />
      <MessageThreadPanel referralId={referral.id} token={auth.accessToken} />
    </div>
  );
}
