'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, CardBody, CardHeader, CardTitle, FormField } from '@referralplatform/ui-components';
import { RequireAuth } from '../../components/RequireAuth';
import { useAuth } from '../../lib/auth/AuthContext';
import { FOLLOW_UP_REFERRAL_TYPES, createFollowUpPlan, type FollowUpReferralType } from '../../lib/api/followupApi';

const fieldStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 'var(--rp-touch-target-min)',
  padding: '0 8px',
  border: '1px solid var(--rp-color-border)',
  borderRadius: 'var(--rp-radius-md)',
  fontFamily: 'var(--rp-font-family)',
  fontSize: 'var(--rp-font-size-body)',
};

/**
 * Follow-up Plan creation — claude/ui-design.md's Specialist portal screen
 * #4: "structured next-review-date, required-tests, referral-type
 * fields." Calls the real Follow-up & Recall Service
 * (services/followup-recall) — see BUILD_LOG/followup-recall.md for the
 * reminder-scheduling/deceased-suppression machinery this plan feeds into
 * once created.
 */
export default function NewFollowUpPlanPage() {
  return (
    <RequireAuth>
      <React.Suspense fallback={<main style={{ padding: 'var(--rp-space-5)' }}>Loading…</main>}>
        <NewFollowUpPlanForm />
      </React.Suspense>
    </RequireAuth>
  );
}

function NewFollowUpPlanForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken } = useAuth();

  const [referralId, setReferralId] = React.useState(searchParams.get('referralId') ?? '');
  const [patientId, setPatientId] = React.useState(searchParams.get('patientId') ?? '');
  const [gpId, setGpId] = React.useState(searchParams.get('gpId') ?? '');
  const [referralType, setReferralType] = React.useState<FollowUpReferralType>('specialist_review');
  const [nextReviewDueAt, setNextReviewDueAt] = React.useState('');
  const [testsText, setTestsText] = React.useState('');
  const [indefinite, setIndefinite] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createFollowUpPlan(accessToken, {
        referralId,
        patientId,
        gpId,
        referralType,
        nextReviewDueAt: new Date(nextReviewDueAt).toISOString(),
        requiredTests: testsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        indefiniteReferralApplies: indefinite,
      });
      setSuccess(true);
      setTimeout(() => router.push('/followup-plans'), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create the Follow-up Plan.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--rp-space-5)' }}>
      <Card>
        <CardHeader>
          <CardTitle>Create a Follow-up Plan</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={submit}>
            <FormField id="fu-referral-id" label="Referral id" required>
              <input
                id="fu-referral-id"
                value={referralId}
                onChange={(e) => setReferralId(e.target.value)}
                style={fieldStyle}
              />
            </FormField>
            <FormField id="fu-patient-id" label="Patient id" required>
              <input
                id="fu-patient-id"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                style={fieldStyle}
              />
            </FormField>
            <FormField id="fu-gp-id" label="Referring GP id" required>
              <input id="fu-gp-id" value={gpId} onChange={(e) => setGpId(e.target.value)} style={fieldStyle} />
            </FormField>
            <FormField id="fu-referral-type" label="Referral type" required>
              <select
                id="fu-referral-type"
                value={referralType}
                onChange={(e) => setReferralType(e.target.value as FollowUpReferralType)}
                style={fieldStyle}
              >
                {FOLLOW_UP_REFERRAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="fu-due" label="Next review due" required>
              <input
                id="fu-due"
                type="date"
                value={nextReviewDueAt}
                onChange={(e) => setNextReviewDueAt(e.target.value)}
                style={fieldStyle}
              />
            </FormField>
            <FormField id="fu-tests" label="Required tests" hint="Comma-separated, e.g. FBC, HbA1c" required>
              <input
                id="fu-tests"
                value={testsText}
                onChange={(e) => setTestsText(e.target.value)}
                style={fieldStyle}
              />
            </FormField>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--rp-space-3)' }}>
              <input type="checkbox" checked={indefinite} onChange={(e) => setIndefinite(e.target.checked)} />
              This is an ongoing/indefinite referral (no new referral needed for future reviews)
            </label>

            {error && <p style={{ color: 'var(--rp-color-urgent-500)' }}>{error}</p>}
            {success && <p style={{ color: 'var(--rp-color-success-500)' }}>Follow-up Plan created.</p>}

            <Button
              type="submit"
              variant="primary"
              disabled={submitting || !referralId || !patientId || !gpId || !nextReviewDueAt || !testsText.trim()}
            >
              {submitting ? 'Creating…' : 'Create Follow-up Plan'}
            </Button>
          </form>
        </CardBody>
      </Card>
    </main>
  );
}
