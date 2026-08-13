'use client';

import * as React from 'react';
import { Button, Card, CardBody, CardHeader, CardTitle, FormField, StatusBadge } from '@referralplatform/ui-components';
import { RequireAuth } from '../../components/RequireAuth';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { useAuth } from '../../lib/auth/AuthContext';
import { approveGpLink, declineGpLink, listGpLinks } from '../../lib/api/gpAuthorisation';
import type { GpLink } from '../../lib/api/types';
import { gpLinkStatusDisplay } from '../../lib/ui/status';

/**
 * "New GP approval" push-approval screen — module 1B of
 * business-process-flow.md. `approveGpLink` requires a step-up
 * (recent passkey/hardware-key re-auth) server-side — see root
 * CONVENTIONS.md §8 — surfaced here as a plain error message if the
 * caller's current session doesn't carry it yet, rather than silently
 * failing.
 */
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-4)' }}>
      {error && <ErrorState message={error} />}

      <Card>
        <CardHeader>
          <CardTitle>GPs asking to access your referrals</CardTitle>
        </CardHeader>
        <CardBody>
          {pending.length === 0 ? (
            <p>No pending requests right now.</p>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--rp-space-3)',
              }}
            >
              {pending.map((link) => (
                <li
                  key={link.id}
                  style={{
                    border: '1px solid var(--rp-color-border)',
                    borderRadius: 'var(--rp-radius-md)',
                    padding: 'var(--rp-space-3)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 'var(--rp-space-2)',
                    }}
                  >
                    <div>
                      <strong>GP {link.gpId}</strong> at practice {link.practiceHpiO}
                      {link.urgentEscalation && (
                        <div style={{ fontSize: 'var(--rp-font-size-sm)' }}>
                          <StatusBadge
                            tone="urgent"
                            label="Urgent — access already granted, this is for your records"
                          />
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 'var(--rp-font-size-sm)', color: 'var(--rp-color-text-muted)' }}>
                      Requested {new Date(link.approvalRequestedAt).toLocaleDateString('en-AU')} · expires{' '}
                      {new Date(link.approvalExpiresAt).toLocaleDateString('en-AU')}
                    </span>
                  </div>
                  {!link.urgentEscalation && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 'var(--rp-space-2)',
                        marginTop: 'var(--rp-space-3)',
                        alignItems: 'flex-end',
                        flexWrap: 'wrap',
                      }}
                    >
                      <Button variant="primary" onClick={() => onApprove(link.id)} disabled={busyId === link.id}>
                        Approve
                      </Button>
                      <FormField id={`decline-${link.id}`} label="Reason if declining (optional)">
                        <input
                          value={declineReason[link.id] ?? ''}
                          onChange={(e) => setDeclineReason((prev) => ({ ...prev, [link.id]: e.target.value }))}
                        />
                      </FormField>
                      <Button variant="secondary" onClick={() => onDecline(link.id)} disabled={busyId === link.id}>
                        Decline
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {decided.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Past decisions</CardTitle>
          </CardHeader>
          <CardBody>
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
              {decided.map((link) => {
                const { label, tone } = gpLinkStatusDisplay(link.status);
                return (
                  <li key={link.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>
                      GP {link.gpId} — practice {link.practiceHpiO}
                    </span>
                    <StatusBadge tone={tone} label={label} />
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export default function GpApprovalsPage() {
  return (
    <RequireAuth>
      <GpApprovalsContent />
    </RequireAuth>
  );
}
