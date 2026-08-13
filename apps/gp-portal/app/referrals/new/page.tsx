'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button, Card, CardBody, CardHeader, CardTitle, FormField, StatusBadge } from '@referralplatform/ui-components';
import { useRequireGp } from '../../../lib/auth/useRequireGp';
import { LoadingState } from '../../../components/LoadingState';
import { ErrorState } from '../../../components/ErrorState';
import { ApiError } from '../../../lib/api/http';
import { acknowledgeComplianceFlag, createReferral, evaluateCompliance } from '../../../lib/api/referral';
import { suggestPathway } from '../../../lib/api/directory';
import type { AustralianState, ComplianceRule, PathwaySuggestion, ReferralOrigin, ReferralWithFlags } from '../../../lib/api/types';
import { AUSTRALIAN_STATES, REFERRAL_ORIGINS } from '../../../lib/api/types';
import { loadPracticeProfile } from '../../../lib/local/practiceProfile';
import { rememberPatient } from '../../../lib/local/knownPatients';

const ORIGIN_LABEL: Record<ReferralOrigin, string> = {
  gp_in_practice: 'In-practice consult',
  gp_telehealth: 'Telehealth consult',
  patient_requested_urgent: 'Patient-requested urgent',
};

function ComplianceChecklistPreview({ rules }: { rules: ComplianceRule[] }) {
  if (rules.length === 0) return null;
  return (
    <Card style={{ borderColor: 'var(--rp-color-attention-100)', background: 'var(--rp-color-attention-100)' }}>
      <CardHeader>
        <CardTitle>Compliance checklist — decision support only</CardTitle>
      </CardHeader>
      <CardBody>
        <p style={{ marginTop: 0 }}>
          This referral will raise the following checklist item(s) for you to acknowledge after creation. These
          are decision support, never a legal certification.
        </p>
        <ul>
          {rules.map((r) => (
            <li key={r.id}>
              <strong>{r.category.replace(/_/g, ' ')}</strong> ({r.jurisdiction}, v{r.version}): {r.checklistText}
              {r.requiresWwcc && ' — Working with Children Check applies.'}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function HealthPathwaysSuggestion({
  suggestion,
  specialistId,
  onSelectSpecialist,
}: {
  suggestion: PathwaySuggestion;
  specialistId: string;
  onSelectSpecialist: (id: string) => void;
}) {
  return (
    <Card style={{ borderColor: 'var(--rp-color-primary-100)' }}>
      <CardHeader>
        <CardTitle>HealthPathways suggestion</CardTitle>
      </CardHeader>
      <CardBody>
        <p style={{ marginTop: 0 }}>
          Suggested specialist type: <strong>{suggestion.specialistType}</strong> ({suggestion.subspecialty}) —
          confidence {Math.round(suggestion.confidence * 100)}%, source {suggestion.source}.{' '}
          <a href={suggestion.pathwayUrl} target="_blank" rel="noreferrer">
            View pathway
          </a>
        </p>
        {suggestion.matchingDirectoryEntries.length > 0 && (
          <FormField id="specialistPick" label="Matching specialists in the directory">
            <select value={specialistId} onChange={(e) => onSelectSpecialist(e.target.value)}>
              <option value="">— none selected —</option>
              {suggestion.matchingDirectoryEntries.map((entry) => (
                <option key={entry.id} value={entry.specialistId ?? entry.id}>
                  {entry.displayName} ({entry.subspecialty})
                  {entry.practiceLocations[0] ? ` — ${entry.practiceLocations[0].suburb}, ${entry.practiceLocations[0].state}` : ''}
                </option>
              ))}
            </select>
          </FormField>
        )}
      </CardBody>
    </Card>
  );
}

export default function NewReferralPage() {
  const auth = useRequireGp();
  const practice = loadPracticeProfile();

  const [form, setForm] = React.useState({
    patientId: '',
    gpId: practice?.gpId ?? auth.principal?.sub ?? '',
    gpState: (practice?.state as AustralianState) ?? 'NSW',
    origin: 'gp_in_practice' as ReferralOrigin,
    urgent: false,
    reasonForReferral: '',
    specialistId: '',
    patientIsMinor: false,
    dvIndicated: false,
    complexCase: false,
    patientAccountActive: false,
  });
  const [consentGrantees, setConsentGrantees] = React.useState<string[]>(['all_linked_gps']);
  const [newGrantee, setNewGrantee] = React.useState('');

  const [matchedRules, setMatchedRules] = React.useState<ComplianceRule[]>([]);
  const [suggestion, setSuggestion] = React.useState<PathwaySuggestion | null>(null);
  const [suggestionLoading, setSuggestionLoading] = React.useState(false);

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<ReferralWithFlags | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Compliance preview — re-evaluated whenever the inputs that drive it change.
  React.useEffect(() => {
    if (!auth.accessToken) return;
    const timer = setTimeout(async () => {
      try {
        const { matched } = await evaluateCompliance(auth.accessToken!, {
          gpState: form.gpState,
          patientIsMinor: form.patientIsMinor,
          dvIndicated: form.dvIndicated,
          complexCase: form.complexCase,
        });
        setMatchedRules(matched);
      } catch {
        // Non-blocking preview — a failure here doesn't stop referral creation, just hides the preview.
        setMatchedRules([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [auth.accessToken, form.gpState, form.patientIsMinor, form.dvIndicated, form.complexCase]);

  // HealthPathways suggestion — debounced on the free-text reason.
  React.useEffect(() => {
    if (form.reasonForReferral.trim().length < 6) {
      setSuggestion(null);
      return;
    }
    setSuggestionLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await suggestPathway(form.reasonForReferral);
        setSuggestion(result);
      } catch {
        setSuggestion(null);
      } finally {
        setSuggestionLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.reasonForReferral]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.accessToken) return;
    setSubmitting(true);
    setError(null);
    setCreated(null);
    try {
      const referral = await createReferral(auth.accessToken, {
        patientId: form.patientId,
        gpId: form.gpId,
        specialistId: form.specialistId || undefined,
        origin: form.origin,
        urgent: form.urgent,
        reasonForReferral: form.reasonForReferral,
        gpState: form.gpState,
        patientIsMinor: form.patientIsMinor,
        dvIndicated: form.dvIndicated,
        complexCase: form.complexCase,
        patientAccountActive: form.patientAccountActive,
        consentGrants: consentGrantees.filter(Boolean).map((granteeId) => ({ granteeId })),
      });
      setCreated(referral);
      rememberPatient(form.patientId, form.patientId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create this referral.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onAcknowledgeFlag(flagId: string, note: string) {
    if (!auth.accessToken || !created) return;
    try {
      const updated = await acknowledgeComplianceFlag(auth.accessToken, created.id, flagId, note);
      setCreated((c) => (c ? { ...c, complianceFlags: c.complianceFlags.map((f) => (f.id === flagId ? updated : f)) } : c));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the acknowledgement.');
    }
  }

  if (auth.status !== 'authenticated' || !auth.accessToken) return <LoadingState label="Signing you in…" />;

  if (created) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-4)' }}>
        <StatusBadge tone="success" label={`Referral created — status: ${created.status}`} />
        <Card>
          <CardHeader>
            <CardTitle>Referral {created.id}</CardTitle>
          </CardHeader>
          <CardBody>
            <p>Patient {created.patientId}, GP {created.gpId}. Urgent: {created.urgent ? 'yes' : 'no'}.</p>
            {created.status === 'queued' && (
              <p style={{ color: 'var(--rp-color-attention-500)' }}>
                Queued in the 2-day patient-activation window (expires{' '}
                {created.queueExpiresAt ? new Date(created.queueExpiresAt).toLocaleString() : 'soon'}). It will route
                automatically once the patient activates their account, or lapse if they don&apos;t.
              </p>
            )}
          </CardBody>
        </Card>

        {created.complianceFlags.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Acknowledge compliance checklist</CardTitle>
            </CardHeader>
            <CardBody>
              {created.complianceFlags.map((flag) => (
                <ComplianceFlagRow key={flag.id} flag={flag} onAcknowledge={onAcknowledgeFlag} />
              ))}
            </CardBody>
          </Card>
        )}

        <div style={{ display: 'flex', gap: 'var(--rp-space-2)' }}>
          <Link href={`/referrals/${created.id}`}>
            <Button variant="secondary">View referral detail</Button>
          </Link>
          <Button variant="ghost" onClick={() => setCreated(null)}>
            Create another referral
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-4)' }}>
      <h2 style={{ fontFamily: 'var(--rp-font-family)' }}>Create a referral</h2>
      {error && <ErrorState message={error} />}

      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-4)' }}>
        <Card>
          <CardBody>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 var(--rp-space-3)' }}>
              <FormField id="patientId" label="Patient id" required>
                <input value={form.patientId} onChange={(e) => set('patientId', e.target.value)} required />
              </FormField>
              <FormField id="gpId" label="Your GP id" required>
                <input value={form.gpId} onChange={(e) => set('gpId', e.target.value)} required />
              </FormField>
              <FormField id="gpState" label="Your (treating GP's) state" required>
                <select value={form.gpState} onChange={(e) => set('gpState', e.target.value as AustralianState)}>
                  {AUSTRALIAN_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField id="origin" label="Origin" required>
                <select value={form.origin} onChange={(e) => set('origin', e.target.value as ReferralOrigin)}>
                  {REFERRAL_ORIGINS.map((o) => (
                    <option key={o} value={o}>
                      {ORIGIN_LABEL[o]}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <FormField id="reasonForReferral" label="Reason for referral" required>
              <textarea
                value={form.reasonForReferral}
                onChange={(e) => set('reasonForReferral', e.target.value)}
                rows={4}
                required
              />
            </FormField>

            <FormField
              id="urgent"
              label="Urgent fast-path"
              hint="Skips booking-preference negotiation, offers earliest slot directly"
            >
              <input type="checkbox" checked={form.urgent} onChange={(e) => set('urgent', e.target.checked)} />
            </FormField>

            <FormField
              id="patientAccountActive"
              label="Patient account already active"
              hint="Leave unchecked if unsure — the referral will safely queue for up to 2 days instead"
            >
              <input
                type="checkbox"
                checked={form.patientAccountActive}
                onChange={(e) => set('patientAccountActive', e.target.checked)}
              />
            </FormField>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compliance-flag inputs</CardTitle>
          </CardHeader>
          <CardBody>
            <FormField id="patientIsMinor" label="Patient is a minor">
              <input type="checkbox" checked={form.patientIsMinor} onChange={(e) => set('patientIsMinor', e.target.checked)} />
            </FormField>
            <FormField id="dvIndicated" label="Domestic-violence indicated">
              <input type="checkbox" checked={form.dvIndicated} onChange={(e) => set('dvIndicated', e.target.checked)} />
            </FormField>
            <FormField id="complexCase" label="Complex case">
              <input type="checkbox" checked={form.complexCase} onChange={(e) => set('complexCase', e.target.checked)} />
            </FormField>
          </CardBody>
        </Card>

        <ComplianceChecklistPreview rules={matchedRules} />

        {suggestionLoading && <LoadingState label="Looking up a HealthPathways suggestion…" />}
        {suggestion && (
          <HealthPathwaysSuggestion
            suggestion={suggestion}
            specialistId={form.specialistId}
            onSelectSpecialist={(id) => set('specialistId', id)}
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle>Consent capture</CardTitle>
          </CardHeader>
          <CardBody>
            <p style={{ marginTop: 0 }}>
              Who may view this specific referral (per-referral consent, in addition to whatever the patient has set
              on their consent/security page).
            </p>
            <ul>
              {consentGrantees.map((g, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--rp-space-2)' }}>
                  <code>{g}</code>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setConsentGrantees((list) => list.filter((_, idx) => idx !== i))}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: 'var(--rp-space-2)' }}>
              <input
                aria-label="Add a grantee id"
                value={newGrantee}
                onChange={(e) => setNewGrantee(e.target.value)}
                placeholder="GP id, specialist id, or 'all_linked_gps'"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (newGrantee.trim()) {
                    setConsentGrantees((list) => [...list, newGrantee.trim()]);
                    setNewGrantee('');
                  }
                }}
              >
                Add
              </Button>
            </div>
          </CardBody>
        </Card>

        <div>
          <Button type="submit" variant="primary" size="lg" disabled={submitting}>
            {submitting ? 'Creating referral…' : 'Create referral'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ComplianceFlagRow({
  flag,
  onAcknowledge,
}: {
  flag: ReferralWithFlags['complianceFlags'][number];
  onAcknowledge: (flagId: string, note: string) => void;
}) {
  const [note, setNote] = React.useState('');
  return (
    <div style={{ borderTop: '1px solid var(--rp-color-border)', paddingTop: 'var(--rp-space-2)', marginTop: 'var(--rp-space-2)' }}>
      <p style={{ margin: 0 }}>
        <strong>{flag.category.replace(/_/g, ' ')}</strong> ({flag.jurisdiction}) —{' '}
        {flag.checklistAcknowledgedAt ? (
          <StatusBadge tone="success" label={`Acknowledged ${new Date(flag.checklistAcknowledgedAt).toLocaleString()}`} />
        ) : (
          <StatusBadge tone="attention" label="Not yet acknowledged" />
        )}
      </p>
      {!flag.checklistAcknowledgedAt && (
        <div style={{ display: 'flex', gap: 'var(--rp-space-2)', marginTop: 'var(--rp-space-2)' }}>
          <input
            aria-label={`Acknowledgement note for ${flag.category}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            style={{ flex: 1 }}
          />
          <Button type="button" variant="secondary" onClick={() => onAcknowledge(flag.id, note)}>
            Acknowledge
          </Button>
        </div>
      )}
    </div>
  );
}
