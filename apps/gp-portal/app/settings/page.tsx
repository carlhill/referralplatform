'use client';

import * as React from 'react';
import { Button, Card, CardBody, CardHeader, CardTitle, FormField, StatusBadge } from '@referralplatform/ui-components';
import { useRequireGp } from '../../lib/auth/useRequireGp';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { ApiError } from '../../lib/api/http';
import { acknowledgeComplianceChecklist, getGpPractice, registerGpPractice } from '../../lib/api/onboarding';
import type { AustralianState, GpPractice, IntegrationTier } from '../../lib/api/types';
import { AUSTRALIAN_STATES, INTEGRATION_TIERS } from '../../lib/api/types';
import { loadPracticeProfile, savePracticeProfile } from '../../lib/local/practiceProfile';

function verificationTone(status: GpPractice['verificationStatus']) {
  if (status === 'verified') return 'success' as const;
  if (status === 'pending') return 'attention' as const;
  return 'urgent' as const;
}

export default function SettingsPage() {
  const auth = useRequireGp();
  const [practice, setPractice] = React.useState<GpPractice | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = React.useState(true);

  const [regForm, setRegForm] = React.useState({
    practiceName: '',
    hpiO: '',
    contactEmail: '',
    state: 'NSW' as AustralianState,
    integrationTier: 'A' as IntegrationTier,
  });
  const [registering, setRegistering] = React.useState(false);

  const [ackName, setAckName] = React.useState('');
  const [ackEmail, setAckEmail] = React.useState('');
  const [acking, setAcking] = React.useState(false);

  const loadExisting = React.useCallback(async () => {
    const stored = loadPracticeProfile();
    if (!stored) {
      setLoadingExisting(false);
      return;
    }
    try {
      const found = await getGpPractice(stored.practiceId);
      setPractice(found);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your saved practice profile.');
    } finally {
      setLoadingExisting(false);
    }
  }, []);

  React.useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  async function onRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegistering(true);
    setError(null);
    try {
      const created = await registerGpPractice(regForm);
      setPractice(created);
      savePracticeProfile({
        practiceId: created.id,
        practiceName: created.practiceName,
        hpiO: created.hpiO,
        state: created.state,
        contactEmail: created.contactEmail,
        gpId: auth.principal?.sub ?? '',
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not register this practice.');
    } finally {
      setRegistering(false);
    }
  }

  async function onAcknowledge(e: React.FormEvent) {
    e.preventDefault();
    if (!practice) return;
    setAcking(true);
    setError(null);
    try {
      const updated = await acknowledgeComplianceChecklist(practice.id, {
        acknowledgedByName: ackName,
        acknowledgedByEmail: ackEmail,
      });
      setPractice(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the acknowledgement.');
    } finally {
      setAcking(false);
    }
  }

  if (auth.status !== 'authenticated') return <LoadingState label="Signing you in…" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-4)' }}>
      <h2 style={{ fontFamily: 'var(--rp-font-family)' }}>Practice settings</h2>
      {error && <ErrorState message={error} onRetry={() => void loadExisting()} />}

      {loadingExisting ? (
        <LoadingState label="Loading your practice profile…" />
      ) : practice ? (
        <Card>
          <CardHeader>
            <CardTitle>{practice.practiceName}</CardTitle>
          </CardHeader>
          <CardBody>
            <dl style={{ display: 'grid', gridTemplateColumns: '200px 1fr', rowGap: 'var(--rp-space-1)' }}>
              <dt>HPI-O</dt>
              <dd>
                <code>{practice.hpiO}</code>
              </dd>
              <dt>HPI-O verification status</dt>
              <dd>
                <StatusBadge tone={verificationTone(practice.verificationStatus)} label={practice.verificationStatus} />
              </dd>
              <dt>Integration tier</dt>
              <dd>
                {practice.integrationTier} —{' '}
                {practice.integrationTier === 'A'
                  ? 'structured booking, no deep integration'
                  : practice.integrationTier === 'B'
                    ? 'secure-messaging connection'
                    : 'native send button'}
              </dd>
              <dt>State</dt>
              <dd>{practice.state}</dd>
              <dt>Contact email</dt>
              <dd>{practice.contactEmail}</dd>
              <dt>Compliance checklist</dt>
              <dd>
                {practice.complianceChecklistAcknowledgedAt ? (
                  <StatusBadge
                    tone="success"
                    label={`Acknowledged ${new Date(practice.complianceChecklistAcknowledgedAt).toLocaleDateString()} by ${practice.complianceChecklistAcknowledgedByName}`}
                  />
                ) : (
                  <StatusBadge tone="attention" label="Not yet acknowledged" />
                )}
              </dd>
            </dl>

            {!practice.complianceChecklistAcknowledgedAt && (
              <form onSubmit={onAcknowledge} style={{ marginTop: 'var(--rp-space-3)' }}>
                <p>
                  The compliance checklist is decision support only, never a legal certification. Acknowledge this
                  before the practice can trigger new patient account requests.
                </p>
                <FormField id="ackName" label="Acknowledged by (name)" required>
                  <input value={ackName} onChange={(e) => setAckName(e.target.value)} required />
                </FormField>
                <FormField id="ackEmail" label="Acknowledged by (email)" required>
                  <input type="email" value={ackEmail} onChange={(e) => setAckEmail(e.target.value)} required />
                </FormField>
                <Button type="submit" variant="primary" disabled={acking}>
                  {acking ? 'Recording…' : 'Acknowledge compliance checklist'}
                </Button>
              </form>
            )}
            {practice.verificationStatus !== 'verified' && (
              <p style={{ color: 'var(--rp-color-urgent-500)', marginTop: 'var(--rp-space-3)' }}>
                This practice&apos;s HPI-O did not verify against the (mocked) Healthcare Identifiers Service —
                new patient account requests will be blocked until this is resolved.
              </p>
            )}
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Register your practice</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={onRegister}>
              <FormField id="practiceName" label="Practice name" required>
                <input
                  value={regForm.practiceName}
                  onChange={(e) => setRegForm((f) => ({ ...f, practiceName: e.target.value }))}
                  required
                />
              </FormField>
              <FormField id="hpiO" label="HPI-O (16 digits)" required>
                <input
                  value={regForm.hpiO}
                  onChange={(e) => setRegForm((f) => ({ ...f, hpiO: e.target.value }))}
                  pattern="\d{16}"
                  maxLength={16}
                  required
                />
              </FormField>
              <FormField id="contactEmail" label="Contact email" required>
                <input
                  type="email"
                  value={regForm.contactEmail}
                  onChange={(e) => setRegForm((f) => ({ ...f, contactEmail: e.target.value }))}
                  required
                />
              </FormField>
              <FormField id="state" label="State" required>
                <select value={regForm.state} onChange={(e) => setRegForm((f) => ({ ...f, state: e.target.value as AustralianState }))}>
                  {AUSTRALIAN_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField id="integrationTier" label="Integration tier">
                <select
                  value={regForm.integrationTier}
                  onChange={(e) => setRegForm((f) => ({ ...f, integrationTier: e.target.value as IntegrationTier }))}
                >
                  {INTEGRATION_TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </FormField>
              <Button type="submit" variant="primary" disabled={registering}>
                {registering ? 'Registering…' : 'Register practice'}
              </Button>
            </form>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
