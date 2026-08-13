'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button, Card, CardBody, CardHeader, CardTitle, FormField } from '@referralplatform/ui-components';
import { RequireAuth } from '../components/RequireAuth';
import { StatusPill } from '../components/StatusPill';
import { useAuth } from '../lib/auth/AuthContext';
import { listFollowUpPlansForPatient, type FollowUpPlan } from '../lib/api/followupApi';

/**
 * Follow-up Plan lookup — `GET /follow-up-plans` (Follow-up & Recall
 * Service) requires a `patientId` query param, with no specialist-scoped
 * listing endpoint (see BUILD_LOG/followup-recall.md's "no consent/
 * relationship check beyond principal-type gating" gap — there's no
 * specialistId filter to piggyback on either). This screen is therefore a
 * per-patient lookup rather than a specialist-wide list; "Create a new
 * plan" is always available from here or from a case's detail page.
 */
export default function FollowUpPlansPage() {
  return (
    <RequireAuth>
      <FollowUpPlansContent />
    </RequireAuth>
  );
}

function FollowUpPlansContent() {
  const { accessToken } = useAuth();
  const [patientId, setPatientId] = React.useState('');
  const [plans, setPlans] = React.useState<FollowUpPlan[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      setPlans(await listFollowUpPlansForPatient(accessToken, patientId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Follow-up Plans.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 'var(--rp-space-5)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--rp-space-4)',
        }}
      >
        <h1 style={{ fontSize: 'var(--rp-font-size-xl)' }}>Follow-up plans</h1>
        <Button asChild variant="primary">
          <Link href="/followup-plans/new">Create a plan</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Find a patient's plans</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={search} style={{ display: 'flex', gap: 'var(--rp-space-2)', alignItems: 'flex-end' }}>
            <FormField id="patient-id-search" label="Patient id">
              <input
                id="patient-id-search"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                style={{
                  minHeight: 'var(--rp-touch-target-min)',
                  padding: '0 8px',
                  border: '1px solid var(--rp-color-border)',
                  borderRadius: 'var(--rp-radius-md)',
                }}
              />
            </FormField>
            <Button type="submit" variant="secondary" disabled={loading || !patientId}>
              {loading ? 'Searching…' : 'Search'}
            </Button>
          </form>
          {error && <p style={{ color: 'var(--rp-color-urgent-500)' }}>{error}</p>}
        </CardBody>
      </Card>

      {plans && (
        <div
          style={{ marginTop: 'var(--rp-space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-3)' }}
        >
          {plans.length === 0 && (
            <p style={{ color: 'var(--rp-color-text-muted)' }}>No Follow-up Plans for this patient.</p>
          )}
          {plans.map((plan) => (
            <Card key={plan.id}>
              <CardBody>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ margin: 0, fontWeight: 'var(--rp-font-weight-medium)' }}>
                    {plan.referralType.replace(/_/g, ' ')}
                  </p>
                  <StatusPill status={plan.status} />
                </div>
                <p style={{ margin: '4px 0' }}>
                  Next review due: {new Date(plan.nextReviewDueAt).toLocaleDateString('en-AU')}
                </p>
                <p style={{ margin: 0, color: 'var(--rp-color-text-muted)', fontSize: 'var(--rp-font-size-sm)' }}>
                  Required tests: {plan.requiredTests.join(', ') || 'none listed'}
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
