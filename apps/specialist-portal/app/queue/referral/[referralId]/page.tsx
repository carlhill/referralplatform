'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader, CardTitle, Button, FormField } from '@referralplatform/ui-components';
import { RequireAuth } from '../../../components/RequireAuth';
import { StatusPill } from '../../../components/StatusPill';
import { useAuth } from '../../../lib/auth/AuthContext';
import { declineReferral, getReferral } from '../../../lib/api/referralApi';
import type { Referral } from '@referralplatform/shared-types';

/**
 * Decision screen for a referral still at the Referral Service's `routed`
 * status (not yet booked) — see app/queue/page.tsx's doc comment for why
 * this is a separate screen/service from the case-review flow at
 * app/queue/[caseId]. `routed -> booked | declined | cancelled` is the
 * Referral Service's own state machine (referral-status.ts) — decline
 * (with a reason, dual-notified per module 4 of business-process-flow.md,
 * the Notification Service's job not this app's) is the only decision this
 * app makes at this stage; there's no "accept" button because accepting is
 * implicit — the referral simply proceeds once the patient/GP confirms a
 * booking (services/booking), at which point it reappears in "In review"
 * on the queue page as a specialist-review Case.
 */
export default function ReferralDecisionPage() {
  return (
    <RequireAuth>
      <ReferralDecisionContent />
    </RequireAuth>
  );
}

function ReferralDecisionContent() {
  const params = useParams<{ referralId: string }>();
  const router = useRouter();
  const { accessToken } = useAuth();
  const [referral, setReferral] = React.useState<Referral | null>(null);
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setReferral(await getReferral(accessToken, params.referralId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load this referral.');
    }
  }, [accessToken, params.referralId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleDecline = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await declineReferral(accessToken, params.referralId, reason || undefined);
      router.push('/queue');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline this referral.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!referral) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--rp-space-5)' }}>
        {error ? <p style={{ color: 'var(--rp-color-urgent-500)' }}>{error}</p> : <p>Loading…</p>}
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--rp-space-5)' }}>
      <Card>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <CardTitle>New referral</CardTitle>
            <div style={{ display: 'flex', gap: 'var(--rp-space-2)' }}>
              {referral.urgent && <StatusPill status="urgent" />}
              <StatusPill status={referral.status} />
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <p style={{ fontWeight: 'var(--rp-font-weight-medium)' }}>Reason for referral</p>
          <p>{referral.reasonForReferral}</p>
          <p style={{ color: 'var(--rp-color-text-muted)', fontSize: 'var(--rp-font-size-sm)' }}>
            Patient {referral.patientId} · Referring GP {referral.gpId} · Received{' '}
            {new Date(referral.createdAt).toLocaleString('en-AU')}
          </p>

          {referral.status === 'routed' ? (
            <div
              style={{
                marginTop: 'var(--rp-space-4)',
                borderTop: '1px solid var(--rp-color-border)',
                paddingTop: 'var(--rp-space-4)',
              }}
            >
              <p style={{ color: 'var(--rp-color-text-muted)' }}>
                No action needed to accept — the patient (or their GP) will book an appointment with you next, and this
                referral will move to your “In review” list once they do. Decline only if this referral is not
                appropriate for your practice.
              </p>
              <FormField id="decline-reason" label="Reason for declining (optional but recommended)">
                <textarea
                  id="decline-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    fontFamily: 'var(--rp-font-family)',
                    fontSize: 'var(--rp-font-size-body)',
                    padding: 'var(--rp-space-2)',
                    border: '1px solid var(--rp-color-border)',
                    borderRadius: 'var(--rp-radius-md)',
                  }}
                />
              </FormField>
              {error && <p style={{ color: 'var(--rp-color-urgent-500)' }}>{error}</p>}
              <Button variant="urgent" onClick={handleDecline} disabled={submitting}>
                {submitting ? 'Declining…' : 'Decline referral'}
              </Button>
            </div>
          ) : (
            <p style={{ marginTop: 'var(--rp-space-4)', color: 'var(--rp-color-text-muted)' }}>
              This referral is no longer awaiting your decision (status: {referral.status}).
            </p>
          )}
        </CardBody>
      </Card>
    </main>
  );
}
