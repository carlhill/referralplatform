'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardBody, CardHeader, CardTitle, Button } from '@referralplatform/ui-components';
import { RequireAuth } from '../components/RequireAuth';
import { StatusPill } from '../components/StatusPill';
import { useAuth } from '../lib/auth/AuthContext';
import { listReferrals } from '../lib/api/referralApi';
import { listCases, listExtractions, type ExtractionResult, type ReferralCase } from '../lib/api/specialistReviewApi';
import type { Referral } from '@referralplatform/shared-types';

/**
 * The Incoming Referral Queue — claude/ui-design.md's Specialist portal
 * screen #1: "with the AI-assisted structured extraction summary shown
 * first, full letter available on demand."
 *
 * Two sections, deliberately not merged into one list — they're genuinely
 * two different backend records at two different points in the referral
 * lifecycle (see this file's "why two sections" note below, and
 * app/queue/referral/[referralId]/page.tsx / app/queue/[caseId]/page.tsx's
 * doc comments for the full reasoning):
 *
 * 1. **New referrals** (`services/referral`, status `routed`) — not yet
 *    booked. The only specialist action available at this stage in the
 *    Referral Service's own state machine (routed -> booked | declined |
 *    cancelled — see referral-status.ts) is to decline as inappropriate;
 *    there's no explicit "accept" transition (accepting is implicit: the
 *    patient/GP goes on to book a slot).
 * 2. **In review** (`services/specialist-review`, a `ReferralCase` per
 *    booked referral) — this is where the AI-assisted extraction, the
 *    explicit-confirmation gate, and the eConsult-vs-full-appointment
 *    branch decision (ui-design's "accept / respond with advice / decline"
 *    screen) actually live.
 */
export default function QueuePage() {
  return (
    <RequireAuth>
      <QueueContent />
    </RequireAuth>
  );
}

function QueueContent() {
  const { accessToken, specialistId } = useAuth();
  const [newReferrals, setNewReferrals] = React.useState<Referral[] | null>(null);
  const [cases, setCases] = React.useState<ReferralCase[] | null>(null);
  const [summaries, setSummaries] = React.useState<Record<string, ExtractionResult | undefined>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!specialistId) return;
    setLoading(true);
    setError(null);
    try {
      // ListReferralsQueryDto has no specialistId filter (see referralApi.ts's doc
      // comment) — fetch every currently-routed referral and filter client-side.
      const [routed, myCases] = await Promise.all([
        listReferrals(accessToken, { status: 'routed' }),
        listCases(accessToken, { specialistId }),
      ]);
      setNewReferrals(routed.filter((r) => r.specialistId === specialistId));
      setCases(myCases);

      const activeCases = myCases.filter((c) => c.status === 'extracted' || c.status === 'extraction_confirmed');
      const pairs = await Promise.all(
        activeCases.map(async (c) => {
          const extractions = await listExtractions(accessToken, c.id);
          const latest = extractions[extractions.length - 1];
          return [c.id, latest] as const;
        }),
      );
      setSummaries(Object.fromEntries(pairs));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the referral queue.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, specialistId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!specialistId) {
    return (
      <main style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--rp-space-5)' }}>
        <p>Set your specialist id (top right) to load your queue.</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--rp-space-5)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--rp-space-4)',
        }}
      >
        <h1 style={{ fontSize: 'var(--rp-font-size-xl)' }}>Incoming referral queue</h1>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {error && <p style={{ color: 'var(--rp-color-urgent-500)' }}>{error}</p>}

      <section style={{ marginBottom: 'var(--rp-space-5)' }}>
        <h2 style={{ fontSize: 'var(--rp-font-size-lg)', marginBottom: 'var(--rp-space-3)' }}>New referrals</h2>
        {newReferrals && newReferrals.length === 0 && (
          <p style={{ color: 'var(--rp-color-text-muted)' }}>No new referrals waiting.</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-3)' }}>
          {newReferrals?.map((referral) => (
            <Card key={referral.id}>
              <CardBody
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 'var(--rp-space-3)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', gap: 'var(--rp-space-2)', alignItems: 'center', marginBottom: 4 }}>
                    <StatusPill status={referral.status} />
                    {referral.urgent && <StatusPill status="urgent" />}
                  </div>
                  <p style={{ margin: 0, fontWeight: 'var(--rp-font-weight-medium)' }}>{referral.reasonForReferral}</p>
                  <p style={{ margin: 0, color: 'var(--rp-color-text-muted)', fontSize: 'var(--rp-font-size-sm)' }}>
                    Patient {referral.patientId} · Referred {new Date(referral.createdAt).toLocaleDateString('en-AU')}
                  </p>
                </div>
                <Button asChild variant="secondary">
                  <Link href={`/queue/referral/${referral.id}`}>Review</Link>
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 'var(--rp-font-size-lg)', marginBottom: 'var(--rp-space-3)' }}>In review</h2>
        {cases && cases.length === 0 && <p style={{ color: 'var(--rp-color-text-muted)' }}>No cases in review.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-3)' }}>
          {cases
            ?.filter((c) => c.status !== 'completed' && c.status !== 'cancelled')
            .map((referralCase) => {
              const summary = summaries[referralCase.id];
              return (
                <Card key={referralCase.id}>
                  <CardHeader>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <CardTitle>Case {referralCase.id.slice(0, 8)}</CardTitle>
                      <div style={{ display: 'flex', gap: 'var(--rp-space-2)' }}>
                        {referralCase.urgent && <StatusPill status="urgent" />}
                        <StatusPill status={referralCase.status} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardBody>
                    {/* AI-assisted extraction summary shown first, per ui-design.md — the full referral
                        letter is only reachable one click deeper, on the case detail page. */}
                    {summary ? (
                      <ExtractionPreview extraction={summary} />
                    ) : (
                      <p style={{ color: 'var(--rp-color-text-muted)' }}>
                        {referralCase.status === 'received'
                          ? 'Extraction not yet run.'
                          : 'No extraction summary available.'}
                      </p>
                    )}
                    <div style={{ marginTop: 'var(--rp-space-3)' }}>
                      <Button asChild variant="primary">
                        <Link href={`/queue/${referralCase.id}`}>Open case</Link>
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
        </div>
      </section>
    </main>
  );
}

function ExtractionPreview({ extraction }: { extraction: ExtractionResult }) {
  const data = extraction.structuredData as Record<string, unknown>;
  const reason = (data.reasonForReferral as string | undefined) ?? (data.reason as string | undefined);
  const patientName = (data.patient as { name?: string } | undefined)?.name;
  return (
    <div
      style={{
        background: 'var(--rp-color-bg-subtle)',
        border: '1px solid var(--rp-color-border)',
        borderRadius: 'var(--rp-radius-md)',
        padding: 'var(--rp-space-3)',
      }}
    >
      <p style={{ margin: 0, fontSize: 'var(--rp-font-size-sm)', color: 'var(--rp-color-text-muted)' }}>
        AI-assisted extraction ({extraction.providerName}
        {typeof extraction.confidence === 'number' ? `, ${Math.round(extraction.confidence * 100)}% confidence` : ''}) —
        review before acting
      </p>
      {patientName && <p style={{ margin: '4px 0 0' }}>Patient: {patientName}</p>}
      {reason && <p style={{ margin: '4px 0 0' }}>Reason: {reason}</p>}
    </div>
  );
}
