'use client';

import * as React from 'react';
import { Button, Card, CardBody, CardHeader, CardTitle, FormField, StatusBadge } from '@referralplatform/ui-components';
import { useRequireGp } from '../../lib/auth/useRequireGp';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { ApiError } from '../../lib/api/http';
import { requestAccountActivation } from '../../lib/api/onboarding';
import { checkAuthorisation, listGpLinks, requestGpLink } from '../../lib/api/gpAuthorisation';
import type { AccountActivationResult, GpAuthorisationCheck, GpLink } from '../../lib/api/types';
import { gpLinkStatusDisplay } from '../../lib/ui/referralStatus';
import { loadPracticeProfile } from '../../lib/local/practiceProfile';
import { rememberPatient } from '../../lib/local/knownPatients';

function NewAccountForm({ defaultGpId, defaultHpiO }: { defaultGpId: string; defaultHpiO: string }) {
  const [form, setForm] = React.useState({
    triggeringGpId: defaultGpId,
    triggeringGpHpiO: defaultHpiO,
    patientGivenName: '',
    patientFamilyName: '',
    patientDateOfBirth: '',
    patientMobileNumber: '',
    patientEmail: '',
    patientMedicareNumber: '',
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<AccountActivationResult | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await requestAccountActivation({
        ...form,
        patientMedicareNumber: form.patientMedicareNumber || undefined,
      });
      setResult(res);
      rememberPatient(res.patientId, `${form.patientGivenName} ${form.patientFamilyName}`.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not request a new patient account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trigger a new patient account</CardTitle>
      </CardHeader>
      <CardBody>
        <p style={{ color: 'var(--rp-color-text-muted)' }}>
          Sends an activation link to the patient&apos;s email (in production, an SMS to their mobile — see
          BUILD_LOG/gp-portal.md for why this build uses email). The patient has 2 days to verify their identity,
          confirm whether they&apos;re the patient or a carer, and enter the OTP before the account expires.
        </p>
        <form onSubmit={onSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 var(--rp-space-3)' }}>
            <FormField id="triggeringGpId" label="Your GP id" required>
              <input value={form.triggeringGpId} onChange={(e) => set('triggeringGpId', e.target.value)} required />
            </FormField>
            <FormField id="triggeringGpHpiO" label="Practice HPI-O (16 digits)" required>
              <input
                value={form.triggeringGpHpiO}
                onChange={(e) => set('triggeringGpHpiO', e.target.value)}
                pattern="\d{16}"
                maxLength={16}
                required
              />
            </FormField>
            <FormField id="patientGivenName" label="Patient given name" required>
              <input value={form.patientGivenName} onChange={(e) => set('patientGivenName', e.target.value)} required />
            </FormField>
            <FormField id="patientFamilyName" label="Patient family name" required>
              <input value={form.patientFamilyName} onChange={(e) => set('patientFamilyName', e.target.value)} required />
            </FormField>
            <FormField id="patientDateOfBirth" label="Date of birth" required>
              <input
                type="date"
                value={form.patientDateOfBirth}
                onChange={(e) => set('patientDateOfBirth', e.target.value)}
                required
              />
            </FormField>
            <FormField id="patientMobileNumber" label="Patient mobile number" hint="e.g. 04XX XXX XXX" required>
              <input value={form.patientMobileNumber} onChange={(e) => set('patientMobileNumber', e.target.value)} required />
            </FormField>
            <FormField id="patientEmail" label="Patient email" hint="Activation link delivery channel" required>
              <input type="email" value={form.patientEmail} onChange={(e) => set('patientEmail', e.target.value)} required />
            </FormField>
            <FormField id="patientMedicareNumber" label="Medicare number (optional)">
              <input
                value={form.patientMedicareNumber}
                onChange={(e) => set('patientMedicareNumber', e.target.value)}
                maxLength={10}
              />
            </FormField>
          </div>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send activation link'}
          </Button>
        </form>

        {error && (
          <div style={{ marginTop: 'var(--rp-space-3)' }}>
            <ErrorState message={error} />
          </div>
        )}
        {result && (
          <div style={{ marginTop: 'var(--rp-space-3)' }}>
            <StatusBadge tone="success" label="Activation link sent" />
            <dl style={{ marginTop: 'var(--rp-space-2)' }}>
              <dt style={{ fontWeight: 'var(--rp-font-weight-medium)' }}>Patient id</dt>
              <dd>
                <code>{result.patientId}</code>
              </dd>
              <dt style={{ fontWeight: 'var(--rp-font-weight-medium)' }}>Link expires</dt>
              <dd>{new Date(result.linkExpiresAt).toLocaleString()}</dd>
              <dt style={{ fontWeight: 'var(--rp-font-weight-medium)' }}>Activation-queue expires</dt>
              <dd>{new Date(result.queueExpiresAt).toLocaleString()}</dd>
            </dl>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function ExistingAccountLinkForm({
  defaultGpId,
  defaultHpiO,
  token,
}: {
  defaultGpId: string;
  defaultHpiO: string;
  token: string;
}) {
  const [patientId, setPatientId] = React.useState('');
  const [gpId, setGpId] = React.useState(defaultGpId);
  const [practiceHpiO, setPracticeHpiO] = React.useState(defaultHpiO);
  const [urgent, setUrgent] = React.useState(false);
  const [justification, setJustification] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [link, setLink] = React.useState<GpLink | null>(null);
  const [existingLinks, setExistingLinks] = React.useState<GpLink[] | null>(null);
  const [authCheck, setAuthCheck] = React.useState<GpAuthorisationCheck | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setLink(null);
    try {
      const res = await requestGpLink(token, {
        patientId,
        gpId,
        practiceHpiO,
        urgentEscalation: urgent,
        urgentJustification: urgent ? justification : undefined,
      });
      setLink(res);
      rememberPatient(patientId, patientId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not request a GP link.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onCheckStatus() {
    if (!patientId) return;
    setError(null);
    try {
      const [links, auth] = await Promise.all([
        listGpLinks(token, { patientId }),
        checkAuthorisation(token, patientId, gpId),
      ]);
      setExistingLinks(links);
      setAuthCheck(auth);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not look up existing GP links.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request a GP link to an existing patient account</CardTitle>
      </CardHeader>
      <CardBody>
        <p style={{ color: 'var(--rp-color-text-muted)' }}>
          Use this when the patient already has an active ReferralPlatform account (a different GP originally
          triggered it, or they&apos;re a returning patient). The patient must approve the link (push notification,
          up to 2 days) before you can create a referral for them — unless you use the urgent-bypass escalation
          below.
        </p>
        <form onSubmit={onSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 var(--rp-space-3)' }}>
            <FormField id="patientId" label="Patient id" required>
              <input value={patientId} onChange={(e) => setPatientId(e.target.value)} required />
            </FormField>
            <FormField id="linkGpId" label="Your GP id" required>
              <input value={gpId} onChange={(e) => setGpId(e.target.value)} required />
            </FormField>
            <FormField id="linkPracticeHpiO" label="Practice HPI-O (16 digits)" required>
              <input value={practiceHpiO} onChange={(e) => setPracticeHpiO(e.target.value)} pattern="\d{16}" maxLength={16} required />
            </FormField>
          </div>
          <FormField
            id="urgentEscalation"
            label="Urgent-bypass escalation"
            hint="This is urgent — auto-approve now, patient reviews retrospectively"
          >
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
          </FormField>
          {urgent && (
            <FormField id="urgentJustification" label="Urgent justification" required>
              <textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                required
                rows={2}
              />
            </FormField>
          )}
          <div style={{ display: 'flex', gap: 'var(--rp-space-2)' }}>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Requesting…' : 'Request GP link'}
            </Button>
            <Button type="button" variant="secondary" onClick={onCheckStatus} disabled={!patientId}>
              Check existing links
            </Button>
          </div>
        </form>

        {error && (
          <div style={{ marginTop: 'var(--rp-space-3)' }}>
            <ErrorState message={error} />
          </div>
        )}
        {link && (
          <div style={{ marginTop: 'var(--rp-space-3)' }}>
            <StatusBadge {...gpLinkStatusDisplay(link.status)} />
            {link.urgentEscalation && (
              <p style={{ color: 'var(--rp-color-attention-500)' }}>
                Urgent bypass used — the patient will see this on their consent/security page for retrospective
                review.
              </p>
            )}
          </div>
        )}
        {existingLinks && (
          <div style={{ marginTop: 'var(--rp-space-3)' }}>
            <h4 style={{ margin: '0 0 var(--rp-space-2)' }}>Existing links for this patient</h4>
            {authCheck && (
              <p>
                Your authorisation to refer for this patient right now:{' '}
                <StatusBadge tone={authCheck.authorised ? 'success' : 'urgent'} label={authCheck.authorised ? 'Authorised' : 'Not authorised'} />
              </p>
            )}
            {existingLinks.length === 0 ? (
              <p>No GP links found for this patient yet.</p>
            ) : (
              <ul>
                {existingLinks.map((l) => (
                  <li key={l.id}>
                    GP {l.gpId} — <StatusBadge {...gpLinkStatusDisplay(l.status)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function PatientsPage() {
  const auth = useRequireGp();
  if (auth.status !== 'authenticated' || !auth.accessToken) return <LoadingState label="Signing you in…" />;

  const practice = loadPracticeProfile();
  const defaultGpId = practice?.gpId ?? auth.principal?.sub ?? '';
  const defaultHpiO = practice?.hpiO ?? '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-4)' }}>
      <h2 style={{ fontFamily: 'var(--rp-font-family)' }}>Patient search & lookup</h2>
      <NewAccountForm defaultGpId={defaultGpId} defaultHpiO={defaultHpiO} />
      <ExistingAccountLinkForm defaultGpId={defaultGpId} defaultHpiO={defaultHpiO} token={auth.accessToken} />
    </div>
  );
}
