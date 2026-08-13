'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardBody, StatusBadge } from '@referralplatform/ui-components';
import { useRequireGp } from '../../lib/auth/useRequireGp';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { ApiError } from '../../lib/api/http';
import { listReferrals } from '../../lib/api/referral';
import { listThreadsForReferral } from '../../lib/api/notification';
import type { MessageThread } from '../../lib/api/types';
import { loadPracticeProfile } from '../../lib/local/practiceProfile';

interface InboxRow {
  thread: MessageThread;
  referralId: string;
  patientId: string;
}

export default function MessagesPage() {
  const auth = useRequireGp();
  const [rows, setRows] = React.useState<InboxRow[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const practice = loadPracticeProfile();

  const load = React.useCallback(async () => {
    if (!auth.accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const gpId = practice?.gpId ?? auth.principal?.sub ?? '';
      const referrals = await listReferrals(auth.accessToken, { gpId });
      const threadLists = await Promise.all(
        referrals.map(async (r) => {
          try {
            const threads = await listThreadsForReferral(auth.accessToken!, r.id);
            return threads.map((t) => ({ thread: t, referralId: r.id, patientId: r.patientId }));
          } catch {
            return [];
          }
        }),
      );
      const flat = threadLists
        .flat()
        .sort((a, b) => new Date(b.thread.updatedAt).getTime() - new Date(a.thread.updatedAt).getTime());
      setRows(flat);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load message threads.');
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken, auth.principal?.sub, practice?.gpId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (auth.status !== 'authenticated' || !auth.accessToken) return <LoadingState label="Signing you in…" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-4)' }}>
      <h2 style={{ fontFamily: 'var(--rp-font-family)' }}>Message threads</h2>
      <p style={{ color: 'var(--rp-color-text-muted)', marginTop: 0 }}>
        Every active referral-scoped conversation for your referrals, most recently updated first.
      </p>

      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {loading && <LoadingState label="Loading message threads…" />}

      {rows && !loading && (
        <>
          {rows.length === 0 ? (
            <Card>
              <CardBody>No message threads yet. They start automatically once you or a specialist send a message from a referral.</CardBody>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-2)' }}>
              {rows.map((row) => (
                <Link key={row.thread.id} href={`/referrals/${row.referralId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <Card style={{ cursor: 'pointer' }}>
                    <CardBody>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <p style={{ margin: 0, fontWeight: 'var(--rp-font-weight-medium)' }}>
                            {row.thread.subject ?? `Referral ${row.referralId}`}
                          </p>
                          <p style={{ margin: 0, color: 'var(--rp-color-text-muted)' }}>Patient {row.patientId}</p>
                          <p style={{ margin: 0, fontSize: 'var(--rp-font-size-sm)', color: 'var(--rp-color-text-muted)' }}>
                            Updated {new Date(row.thread.updatedAt).toLocaleString()}
                          </p>
                        </div>
                        <StatusBadge tone={row.thread.status === 'resolved' ? 'success' : 'neutral'} label={row.thread.status} />
                      </div>
                    </CardBody>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
