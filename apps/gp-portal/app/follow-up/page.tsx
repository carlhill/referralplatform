'use client';

import * as React from 'react';
import { Button, Card, CardBody, FormField, StatusBadge } from '@referralplatform/ui-components';
import { useRequireGp } from '../../lib/auth/useRequireGp';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { ApiError } from '../../lib/api/http';
import { listFollowUpPlansForPatient, selfReportCompletion } from '../../lib/api/followUpRecall';
import type { FollowUpPlan } from '../../lib/api/types';
import { followUpStatusDisplay, followUpUrgency } from '../../lib/ui/referralStatus';
import { loadKnownPatients } from '../../lib/local/knownPatients';

interface Row extends FollowUpPlan {
  patientDisplayName: string;
}

export default function FollowUpPage() {
  const auth = useRequireGp();
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [extraPatientId, setExtraPatientId] = React.useState('');
  const [onlyActive, setOnlyActive] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!auth.accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const knownPatients = loadKnownPatients();
      const patientIds = new Set(knownPatients.map((p) => p.patientId));
      if (extraPatientId) patientIds.add(extraPatientId);

      const results = await Promise.all(
        Array.from(patientIds).map(async (patientId) => {
          try {
            const plans = await listFollowUpPlansForPatient(auth.accessToken!, patientId, onlyActive ? 'active' : undefined);
            const displayName = knownPatients.find((p) => p.patientId === patientId)?.displayName ?? patientId;
            return plans.map((plan) => ({ ...plan, patientDisplayName: displayName }));
          } catch {
            return [];
          }
        }),
      );
      const flat = results.flat().sort((a, b) => new Date(a.nextReviewDueAt).getTime() - new Date(b.nextReviewDueAt).getTime());
      setRows(flat);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load Follow-up Plans.');
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken, extraPatientId, onlyActive]);

  React.useEffect(() => {
    void load();
  }, [auth.accessToken]);

  async function onSelfReport(planId: string) {
    if (!auth.accessToken) return;
    try {
      await selfReportCompletion(auth.accessToken, planId, { reportedBy: 'gp', note: 'Reported complete via GP portal' });
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record test completion.');
    }
  }

  if (auth.status !== 'authenticated' || !auth.accessToken) return <LoadingState label="Signing you in…" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-4)' }}>
      <h2 style={{ fontFamily: 'var(--rp-font-family)' }}>Follow-up & recall dashboard</h2>
      <p style={{ color: 'var(--rp-color-text-muted)', marginTop: 0 }}>
        Courtesy calls due, tests overdue, and Follow-up Plans needing action — across every patient this browser
        has seen (created a referral, account request, or GP-link request for). See BUILD_LOG/gp-portal.md: no
        backend endpoint yet lists a GP practice&apos;s whole patient panel, so add a patient id below if one you
        need isn&apos;t showing.
      </p>

      <Card>
        <CardBody>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void load();
            }}
            style={{ display: 'flex', gap: 'var(--rp-space-3)', alignItems: 'end', flexWrap: 'wrap' }}
          >
            <FormField id="extraPatientId" label="Add a patient id">
              <input value={extraPatientId} onChange={(e) => setExtraPatientId(e.target.value)} placeholder="Optional" />
            </FormField>
            <FormField id="onlyActive" label="Show only active plans">
              <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
            </FormField>
            <Button type="submit" variant="primary">
              Refresh
            </Button>
          </form>
        </CardBody>
      </Card>

      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {loading && <LoadingState label="Loading Follow-up Plans…" />}

      {rows && !loading && (
        <>
          {rows.length === 0 ? (
            <Card>
              <CardBody>No Follow-up Plans found for known patients.</CardBody>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-2)' }}>
              {rows.map((plan) => {
                const { label, tone } = followUpStatusDisplay(plan.status);
                const urgency = followUpUrgency(plan.nextReviewDueAt, plan.gpCourtesyCallDueAt);
                return (
                  <Card key={plan.id}>
                    <CardBody>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 'var(--rp-space-3)' }}>
                        <div>
                          <p style={{ margin: 0, fontWeight: 'var(--rp-font-weight-medium)' }}>{plan.patientDisplayName}</p>
                          <p style={{ margin: 0 }}>
                            Next review due <strong>{new Date(plan.nextReviewDueAt).toLocaleDateString()}</strong>
                            {urgency !== 'neutral' && (
                              <StatusBadge tone={urgency} label={urgency === 'urgent' ? 'Overdue' : 'Courtesy call due'} style={{ marginLeft: 'var(--rp-space-2)' }} />
                            )}
                          </p>
                          {plan.requiredTests.length > 0 && <p style={{ margin: 0, color: 'var(--rp-color-text-muted)' }}>Tests: {plan.requiredTests.join(', ')}</p>}
                          {plan.gpCourtesyCallDueAt && (
                            <p style={{ margin: 0, fontSize: 'var(--rp-font-size-sm)', color: 'var(--rp-color-text-muted)' }}>
                              Courtesy call due {new Date(plan.gpCourtesyCallDueAt).toLocaleDateString()}
                              {plan.gpCourtesyCallCompletedAt ? ' (completed)' : ''}
                            </p>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <StatusBadge tone={tone} label={label} />
                          {plan.status === 'active' && (
                            <div style={{ marginTop: 'var(--rp-space-2)' }}>
                              <Button variant="secondary" onClick={() => onSelfReport(plan.id)}>
                                Mark test complete (self-report)
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
