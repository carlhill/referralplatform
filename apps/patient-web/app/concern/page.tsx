'use client';

import * as React from 'react';
import { Button, Card, CardBody, CardHeader, CardTitle, FormField, StatusBadge } from '@referralplatform/ui-components';
import { RequireAuth } from '../../components/RequireAuth';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { useAuth } from '../../lib/auth/AuthContext';
import { listConcerns, raiseConcern } from '../../lib/api/consentSecurity';
import type { Concern } from '../../lib/api/types';
import { concernStatusDisplay } from '../../lib/ui/status';

/**
 * "Raise a concern" entry point — plain-language triage questions, per
 * complaints-continuity-deceased.md §1 and consent-security's own
 * RaiseConcernDto: the UI never asks the user to pick a category directly.
 */
function ConcernContent() {
  const auth = useAuth();
  const [summary, setSummary] = React.useState('');
  const [aboutCare, setAboutCare] = React.useState(false);
  const [aboutPlatform, setAboutPlatform] = React.useState(false);
  const [aboutPrivacy, setAboutPrivacy] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState<Concern | null>(null);

  const [past, setPast] = React.useState<Concern[] | null>(null);
  const [pastError, setPastError] = React.useState<string | null>(null);

  const loadPast = React.useCallback(async () => {
    if (!auth.accessToken || !auth.principal) return;
    setPastError(null);
    try {
      setPast(await listConcerns(auth.accessToken, auth.principal.sub));
    } catch (err) {
      setPastError(err instanceof Error ? err.message : 'Could not load your past concerns.');
    }
  }, [auth.accessToken, auth.principal]);

  React.useEffect(() => {
    void loadPast();
  }, [loadPast]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.accessToken || !auth.principal) return;
    if (!aboutCare && !aboutPlatform && !aboutPrivacy) {
      setSubmitError('Select at least one option describing what this is about.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const concern = await raiseConcern(auth.accessToken, {
        patientId: auth.principal.sub,
        summary,
        isAboutHowCareWasHandled: aboutCare,
        isAboutSomethingNotWorkingOnThePlatform: aboutPlatform,
        isAboutSomeoneSeeingSomethingTheyShouldnt: aboutPrivacy,
      });
      setSubmitted(concern);
      setSummary('');
      setAboutCare(false);
      setAboutPlatform(false);
      setAboutPrivacy(false);
      await loadPast();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not submit your concern — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-4)' }}>
      <Card>
        <CardHeader>
          <CardTitle>Raise a concern</CardTitle>
        </CardHeader>
        <CardBody>
          {submitted && (
            <div style={{ marginBottom: 'var(--rp-space-3)' }}>
              <StatusBadge tone="success" label="Concern submitted" />
              <p>We&apos;ve routed this to the right team and will follow up.</p>
            </div>
          )}
          {submitError && <ErrorState message={submitError} />}
          <form onSubmit={onSubmit}>
            <p>What is this about? (select all that apply)</p>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--rp-space-1)',
                marginBottom: 'var(--rp-space-1)',
              }}
            >
              <input type="checkbox" checked={aboutCare} onChange={(e) => setAboutCare(e.target.checked)} />
              How my care was handled by a doctor
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--rp-space-1)',
                marginBottom: 'var(--rp-space-1)',
              }}
            >
              <input type="checkbox" checked={aboutPlatform} onChange={(e) => setAboutPlatform(e.target.checked)} />
              Something not working properly on ReferralPlatform
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--rp-space-1)',
                marginBottom: 'var(--rp-space-2)',
              }}
            >
              <input type="checkbox" checked={aboutPrivacy} onChange={(e) => setAboutPrivacy(e.target.checked)} />
              Someone seeing something about me they shouldn&apos;t have
            </label>
            <FormField id="summary" label="Tell us what happened" required>
              <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={5} required minLength={5} />
            </FormField>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit'}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your past concerns</CardTitle>
        </CardHeader>
        <CardBody>
          {pastError && <ErrorState message={pastError} onRetry={loadPast} />}
          {!past && !pastError && <LoadingState label="Loading…" />}
          {past && past.length === 0 && <p>None yet.</p>}
          {past && past.length > 0 && (
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
              {past.map((c) => {
                const { label, tone } = concernStatusDisplay(c.status);
                return (
                  <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--rp-space-2)' }}>
                    <span>{c.summary.slice(0, 80)}</span>
                    <StatusBadge tone={tone} label={label} />
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default function ConcernPage() {
  return (
    <RequireAuth>
      <ConcernContent />
    </RequireAuth>
  );
}
