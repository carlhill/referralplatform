'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button, Card, CardBody, CardHeader, CardTitle, StatusBadge } from '@referralplatform/ui-components';
import { useAuth } from '../lib/auth/AuthContext';
import { RequireAuth } from '../components/RequireAuth';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { listReferrals } from '../lib/api/referral';
import { listGpLinks } from '../lib/api/gpAuthorisation';
import type { GpLink, Referral } from '../lib/api/types';
import { referralStatusDisplay } from '../lib/ui/status';

function DashboardContent() {
  const auth = useAuth();
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-4)' }}>
      <Card>
        <CardHeader>
          <CardTitle>
            Welcome{auth.principal?.principalType === 'carer' ? ' back' : ''}, {auth.principal?.displayName}
          </CardTitle>
        </CardHeader>
        <CardBody>
          <p style={{ margin: 0 }}>
            {active.length === 0
              ? 'You have no active referrals right now.'
              : `You have ${active.length} active referral${active.length === 1 ? '' : 's'}.`}
          </p>
        </CardBody>
      </Card>

      {pendingGpLinks.length > 0 && (
        <Card style={{ borderColor: 'var(--rp-color-attention-100)' }}>
          <CardHeader>
            <CardTitle>Action needed — new GP requesting access</CardTitle>
          </CardHeader>
          <CardBody>
            <p>
              {pendingGpLinks.length} GP{pendingGpLinks.length === 1 ? ' is' : 's are'} waiting for you to approve
              access to your referral history.
            </p>
            <Button asChild variant="primary">
              <Link href="/gp-approvals">Review requests</Link>
            </Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your referrals</CardTitle>
        </CardHeader>
        <CardBody>
          {referrals.length === 0 ? (
            <p>No referrals yet — they&apos;ll show up here as soon as your GP sends one.</p>
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
              {referrals.slice(0, 5).map((r) => {
                const { label, tone } = referralStatusDisplay(r.status);
                return (
                  <li key={r.id}>
                    <Link
                      href={`/referrals/${r.id}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 'var(--rp-space-2)',
                        padding: 'var(--rp-space-2)',
                        border: '1px solid var(--rp-color-border)',
                        borderRadius: 'var(--rp-radius-md)',
                        textDecoration: 'none',
                        color: 'var(--rp-color-text)',
                      }}
                    >
                      <span>{r.reasonForReferral.slice(0, 60)}</span>
                      <StatusBadge tone={r.urgent ? 'urgent' : tone} label={r.urgent ? `Urgent · ${label}` : label} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Button asChild variant="ghost" style={{ marginTop: 'var(--rp-space-3)' }}>
            <Link href="/referrals">See all referrals</Link>
          </Button>
        </CardBody>
      </Card>

      <div style={{ display: 'flex', gap: 'var(--rp-space-3)', flexWrap: 'wrap' }}>
        <Button asChild variant="secondary">
          <Link href="/documents">Document vault</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/consent">Consent &amp; security</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/concern">Raise a concern</Link>
        </Button>
      </div>
    </div>
  );
}

export default function HomePage() {
  const auth = useAuth();
  if (auth.status === 'unauthenticated') {
    return (
      <Card style={{ maxWidth: 480, margin: '48px auto' }}>
        <CardHeader>
          <CardTitle>ReferralPlatform — Patient Companion Web</CardTitle>
        </CardHeader>
        <CardBody>
          <p>Sign in, or continue setting up a new account, to see your referrals and manage who can see them.</p>
          <div style={{ display: 'flex', gap: 'var(--rp-space-2)', marginTop: 'var(--rp-space-3)' }}>
            <Button asChild variant="primary">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/onboarding/activate">Activate a new account</Link>
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
