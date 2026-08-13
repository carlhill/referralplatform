'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardBody, CardHeader, CardTitle, StatusBadge } from '@referralplatform/ui-components';
import { RequireAuth } from '../../components/RequireAuth';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { useAuth } from '../../lib/auth/AuthContext';
import { listReferrals } from '../../lib/api/referral';
import type { Referral } from '../../lib/api/types';
import { referralStatusDisplay } from '../../lib/ui/status';

function ReferralsList() {
  const auth = useAuth();
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
      <CardHeader>
        <CardTitle>My referrals</CardTitle>
      </CardHeader>
      <CardBody>
        {referrals.length === 0 ? (
          <p>No referrals yet.</p>
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
            {referrals
              .slice()
              .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
              .map((r) => {
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
                        padding: 'var(--rp-space-3)',
                        border: '1px solid var(--rp-color-border)',
                        borderRadius: 'var(--rp-radius-md)',
                        textDecoration: 'none',
                        color: 'var(--rp-color-text)',
                      }}
                    >
                      <span>
                        <strong>{r.reasonForReferral.slice(0, 80)}</strong>
                        <br />
                        <span style={{ fontSize: 'var(--rp-font-size-sm)', color: 'var(--rp-color-text-muted)' }}>
                          Referred {new Date(r.createdAt).toLocaleDateString('en-AU')}
                        </span>
                      </span>
                      <StatusBadge tone={r.urgent ? 'urgent' : tone} label={r.urgent ? `Urgent · ${label}` : label} />
                    </Link>
                  </li>
                );
              })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export default function ReferralsPage() {
  return (
    <RequireAuth>
      <ReferralsList />
    </RequireAuth>
  );
}
