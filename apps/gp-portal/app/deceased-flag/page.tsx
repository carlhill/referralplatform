'use client';

import * as React from 'react';
import { Button, Card, CardBody, FormField, StatusBadge } from '@referralplatform/ui-components';
import { useRequireGp } from '../../lib/auth/useRequireGp';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { ApiError } from '../../lib/api/http';
import { flagPatientDeceased, getActiveDeceasedFlag } from '../../lib/api/consentSecurity';
import type { AustralianState, DeceasedFlag } from '../../lib/api/types';
import { AUSTRALIAN_STATES } from '../../lib/api/types';
import { loadPracticeProfile } from '../../lib/local/practiceProfile';

export default function DeceasedFlagPage() {
  const auth = useRequireGp();
  const practice = loadPracticeProfile();

  const [patientId, setPatientId] = React.useState('');
  const [flaggedByGpId, setFlaggedByGpId] = React.useState(practice?.gpId ?? auth.principal?.sub ?? '');
  const [state, setState] = React.useState<AustralianState>((practice?.state as AustralianState) ?? 'NSW');
  const [reason, setReason] = React.useState('');
  const [confirmChecked, setConfirmChecked] = React.useState(false);

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<DeceasedFlag | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [activeFlag, setActiveFlag] = React.useState<DeceasedFlag | null | 'unchecked'>('unchecked');

  async function onCheckExisting() {
    if (!auth.accessToken || !patientId) return;
    setChecking(true);
    setError(null);
    try {
      const flag = await getActiveDeceasedFlag(auth.accessToken, patientId);
      setActiveFlag(flag);
    } catch (err) {
      // A 404 here means "no active flag" for services that model it that way — treat as not-flagged rather than a hard error.
      if (err instanceof ApiError && err.status === 404) {
        setActiveFlag(null);
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not check for an existing deceased flag.');
      }
    } finally {
      setChecking(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.accessToken || !confirmChecked) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const flag = await flagPatientDeceased(auth.accessToken, { patientId, flaggedByGpId, state, reason: reason || undefined });
      setResult(flag);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not flag this patient deceased.');
    } finally {
      setSubmitting(false);
    }
  }

  if (auth.status !== 'authenticated' || !auth.accessToken) return <LoadingState label="Signing you in…" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-4)' }}>
      <h2 style={{ fontFamily: 'var(--rp-font-family)' }}>Deceased-patient flag</h2>
      <p style={{ color: 'var(--rp-color-text-muted)', marginTop: 0 }}>
        Flagging a patient deceased freezes their account and immediately suppresses every scheduled Follow-up &amp;
        Recall reminder — including reminders already scheduled but not yet sent — and starts the executor/family/
        coroner access-request review process. This is not reversible from this screen.
      </p>

      <Card>
        <CardBody>
          <form onSubmit={onSubmit}>
            <FormField id="patientId" label="Patient id" required>
              <input value={patientId} onChange={(e) => setPatientId(e.target.value)} required />
            </FormField>
            <FormField id="flaggedByGpId" label="Your GP id" required>
              <input value={flaggedByGpId} onChange={(e) => setFlaggedByGpId(e.target.value)} required />
            </FormField>
            <FormField id="state" label="Your (treating GP's) state" required>
              <select value={state} onChange={(e) => setState(e.target.value as AustralianState)}>
                {AUSTRALIAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="reason" label="Reason / notes (optional)">
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            </FormField>

            <div style={{ display: 'flex', gap: 'var(--rp-space-2)', marginBottom: 'var(--rp-space-3)' }}>
              <Button type="button" variant="secondary" onClick={onCheckExisting} disabled={!patientId || checking}>
                {checking ? 'Checking…' : 'Check for an existing flag'}
              </Button>
            </div>
            {activeFlag && activeFlag !== 'unchecked' && (
              <StatusBadge tone="urgent" label={`Already flagged deceased on ${new Date(activeFlag.createdAt).toLocaleDateString()}`} />
            )}
            {activeFlag === null && <StatusBadge tone="neutral" label="No active deceased flag" />}

            <FormField
              id="confirm"
              label="I confirm I have first-hand or documented notice that this patient has died"
              required
            >
              <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} required />
            </FormField>

            <Button type="submit" variant="urgent" disabled={submitting || !confirmChecked}>
              {submitting ? 'Flagging…' : 'Flag patient deceased'}
            </Button>
          </form>

          {error && (
            <div style={{ marginTop: 'var(--rp-space-3)' }}>
              <ErrorState message={error} />
            </div>
          )}
          {result && (
            <div style={{ marginTop: 'var(--rp-space-3)' }}>
              <StatusBadge tone="success" label="Patient flagged deceased — account frozen, reminders suppressed" />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
