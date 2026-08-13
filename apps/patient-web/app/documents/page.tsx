'use client';

import * as React from 'react';
import { Button, Card, CardBody, CardHeader, CardTitle, StatusBadge } from '@referralplatform/ui-components';
import { RequireAuth } from '../../components/RequireAuth';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { useAuth } from '../../lib/auth/AuthContext';
import { listReferrals } from '../../lib/api/referral';
import type { Referral } from '../../lib/api/types';

/**
 * Document vault — MOCK / documented gap: there is no dedicated
 * document-storage service in this build (not in root CONVENTIONS.md §1's
 * service list). Real referral letters/specialist letters/pathology results
 * would live there once it exists. Until then, this view derives a
 * "document" per referral from data the Referral Service already has (the
 * referral letter text and any AI structured summary) and offers it as a
 * downloadable text file — a working, honest placeholder, not a real
 * document store. See BUILD_LOG/patient-app.md.
 */
function buildDocumentText(r: Referral): string {
  const lines = [
    `ReferralPlatform — Referral Letter`,
    `Referral ID: ${r.id}`,
    `Created: ${new Date(r.createdAt).toLocaleString('en-AU')}`,
    `Status: ${r.status}`,
    ``,
    `Reason for referral:`,
    r.reasonForReferral,
  ];
  if (r.aiStructuredSummary) {
    lines.push(
      '',
      'AI-assisted structured summary (for reference only — always read alongside the original text above):',
    );
    lines.push(JSON.stringify(r.aiStructuredSummary, null, 2));
  }
  return lines.join('\n');
}

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function DocumentsContent() {
  const auth = useAuth();
  const [referrals, setReferrals] = React.useState<Referral[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!auth.accessToken || !auth.principal) return;
    setError(null);
    try {
      setReferrals(await listReferrals(auth.accessToken, { patientId: auth.principal.sub }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your documents.');
    }
  }, [auth.accessToken, auth.principal]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!referrals) return <LoadingState label="Loading documents…" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Document vault</CardTitle>
      </CardHeader>
      <CardBody>
        <StatusBadge
          tone="neutral"
          label="Referral letters shown here — specialist letters & test results coming soon"
        />
        {referrals.length === 0 ? (
          <p style={{ marginTop: 'var(--rp-space-3)' }}>No documents yet.</p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: 'var(--rp-space-3) 0 0',
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--rp-space-2)',
            }}
          >
            {referrals.map((r) => (
              <li
                key={r.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--rp-space-2)',
                  border: '1px solid var(--rp-color-border)',
                  borderRadius: 'var(--rp-radius-md)',
                }}
              >
                <span>
                  Referral letter — {new Date(r.createdAt).toLocaleDateString('en-AU')}
                  <br />
                  <span style={{ fontSize: 'var(--rp-font-size-sm)', color: 'var(--rp-color-text-muted)' }}>
                    {r.reasonForReferral.slice(0, 60)}
                  </span>
                </span>
                <Button
                  variant="secondary"
                  onClick={() => downloadTextFile(`referral-${r.id}.txt`, buildDocumentText(r))}
                >
                  Download
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export default function DocumentsPage() {
  return (
    <RequireAuth>
      <DocumentsContent />
    </RequireAuth>
  );
}
