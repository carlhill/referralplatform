'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button, Card, CardBody, FormField, StatusBadge } from '@referralplatform/ui-components';
import { useRequireGp } from '../../lib/auth/useRequireGp';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { ApiError } from '../../lib/api/http';
import { listReferrals } from '../../lib/api/referral';
import type { Referral, ReferralStatus } from '../../lib/api/types';
import { referralStatusDisplay } from '../../lib/ui/referralStatus';
import { loadPracticeProfile } from '../../lib/local/practiceProfile';

const STATUS_OPTIONS: Array<ReferralStatus | ''> = [
  '',
  'queued',
  'routed',
  'in_review',
  'booked',
  'resolved_econsult',
  'completed',
  'declined',
  'lapsed',
  'cancelled',
];

function exportCsv(referrals: Referral[]) {
  const header = ['id', 'patientId', 'gpId', 'status', 'origin', 'urgent', 'reasonForReferral', 'createdAt'];
  const rows = referrals.map((r) => [r.id, r.patientId, r.gpId, r.status, r.origin, String(r.urgent), r.reasonForReferral.replace(/\n/g, ' '), r.createdAt]);
  const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `referrals-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReferralsPage() {
  const auth = useRequireGp();
  const practice = loadPracticeProfile();
  const [gpId, setGpId] = React.useState(practice?.gpId ?? auth.principal?.sub ?? '');
  const [patientId, setPatientId] = React.useState('');
  const [status, setStatus] = React.useState<ReferralStatus | ''>('');
  const [referrals, setReferrals] = React.useState<Referral[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!auth.accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const results = await listReferrals(auth.accessToken, {
        gpId: gpId || undefined,
        patientId: patientId || undefined,
        status: status || undefined,
      });
      setReferrals(results);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load referrals.');
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken, gpId, patientId, status]);

  React.useEffect(() => {
    void load();
  }, [auth.accessToken]);

  if (auth.status !== 'authenticated' || !auth.accessToken) return <LoadingState label="Signing you in…" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-4)' }}>
      <h2 style={{ fontFamily: 'var(--rp-font-family)' }}>Referral dashboard</h2>

      <Card>
        <CardBody>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void load();
            }}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) auto', gap: 'var(--rp-space-3)', alignItems: 'end' }}
          >
            <FormField id="filterGpId" label="GP id">
              <input value={gpId} onChange={(e) => setGpId(e.target.value)} />
            </FormField>
            <FormField id="filterPatientId" label="Patient id">
              <input value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="Optional" />
            </FormField>
            <FormField id="filterStatus" label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as ReferralStatus | '')}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s ? referralStatusDisplay(s as ReferralStatus).label : 'All statuses'}
                  </option>
                ))}
              </select>
            </FormField>
            <Button type="submit" variant="primary">
              Filter
            </Button>
          </form>
        </CardBody>
      </Card>

      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {loading && <LoadingState label="Loading referrals…" />}

      {referrals && !loading && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ margin: 0, color: 'var(--rp-color-text-muted)' }}>{referrals.length} referral(s)</p>
            <Button variant="secondary" onClick={() => exportCsv(referrals)} disabled={referrals.length === 0}>
              Export CSV
            </Button>
          </div>

          {referrals.length === 0 ? (
            <Card>
              <CardBody>No referrals match these filters yet.</CardBody>
            </Card>
          ) : (
            <div role="table" aria-label="Referrals" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-2)' }}>
              {referrals.map((r) => {
                const { label, tone } = referralStatusDisplay(r.status);
                return (
                  <Link key={r.id} href={`/referrals/${r.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <Card style={{ cursor: 'pointer' }}>
                      <CardBody>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--rp-space-3)' }}>
                          <div>
                            <p style={{ margin: 0, fontWeight: 'var(--rp-font-weight-medium)' }}>
                              Patient {r.patientId} {r.urgent && <StatusBadge tone="urgent" label="Urgent" />}
                            </p>
                            <p style={{ margin: 0, color: 'var(--rp-color-text-muted)' }}>
                              {r.reasonForReferral.slice(0, 120)}
                              {r.reasonForReferral.length > 120 ? '…' : ''}
                            </p>
                            <p style={{ margin: 0, fontSize: 'var(--rp-font-size-sm)', color: 'var(--rp-color-text-muted)' }}>
                              Created {new Date(r.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <StatusBadge tone={tone} label={label} />
                        </div>
                      </CardBody>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
