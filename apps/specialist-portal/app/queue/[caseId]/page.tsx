'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, CardBody, CardHeader, CardTitle, FormField } from '@referralplatform/ui-components';
import { RequireAuth } from '../../components/RequireAuth';
import { StatusPill } from '../../components/StatusPill';
import { useAuth } from '../../lib/auth/AuthContext';
import {
  cancelCase,
  completeCase,
  confirmExtraction,
  decideBranch,
  getCase,
  listDecisions,
  listExtractions,
  listPathologyRequests,
  rejectExtraction,
  requestPathology,
  runExtraction,
  type ExtractionResult,
  type PathologyImagingRequest,
  type ReferralCase,
  type SpecialistDecision,
} from '../../lib/api/specialistReviewApi';

const textAreaStyle: React.CSSProperties = {
  width: '100%',
  fontFamily: 'var(--rp-font-family)',
  fontSize: 'var(--rp-font-size-body)',
  padding: 'var(--rp-space-2)',
  border: '1px solid var(--rp-color-border)',
  borderRadius: 'var(--rp-radius-md)',
};

/**
 * The Referral Decision screen — claude/ui-design.md's Specialist portal
 * screen #2: "accept / respond with advice (eConsult) / decline-with-reason",
 * built around the Specialist Review Service's real, structurally-enforced
 * explicit-confirmation gate (see BUILD_LOG/specialist-review.md — the
 * "Babylon Health cautionary guardrail": AI extraction output can never
 * auto-action anything).
 *
 * Mapping onto that service's real state machine
 * (received -> extracted -> extraction_confirmed -> (resolved_econsult |
 * full_appointment) -> completed, cancelled from anywhere non-terminal):
 *   - "Accept" = confirm the extraction, then decide branch = full_appointment
 *     (this referral proceeds to a full telehealth/in-person visit).
 *   - "Respond with advice" = confirm the extraction, then decide branch =
 *     econsult with the specialist's written advice — resolves the referral
 *     without a full appointment.
 *   - "Decline with reason" — the Specialist Review Service has no
 *     "declined" case status (decline, in the Referral Service's own state
 *     machine, is only a valid transition from `routed`, i.e. before a case
 *     like this one even exists — see app/queue/referral/[referralId] for
 *     that earlier decision point). What IS available here, and is exactly
 *     as final for the patient/GP, is `POST /cases/:id/cancel` — labelled
 *     "Cancel case (with reason)" below rather than "Decline" so this UI
 *     never claims a transition the backend doesn't actually support.
 */
export default function CaseDetailPage() {
  return (
    <RequireAuth>
      <CaseDetailContent />
    </RequireAuth>
  );
}

function CaseDetailContent() {
  const params = useParams<{ caseId: string }>();
  const router = useRouter();
  const { accessToken } = useAuth();

  const [referralCase, setReferralCase] = React.useState<ReferralCase | null>(null);
  const [extractions, setExtractions] = React.useState<ExtractionResult[]>([]);
  const [decisions, setDecisions] = React.useState<SpecialistDecision[]>([]);
  const [pathologyRequests, setPathologyRequests] = React.useState<PathologyImagingRequest[]>([]);
  const [showFullLetter, setShowFullLetter] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [c, ex, dec, path] = await Promise.all([
        getCase(accessToken, params.caseId),
        listExtractions(accessToken, params.caseId),
        listDecisions(accessToken, params.caseId),
        listPathologyRequests(accessToken, params.caseId),
      ]);
      setReferralCase(c);
      setExtractions(ex);
      setDecisions(dec);
      setPathologyRequests(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load this case.');
    }
  }, [accessToken, params.caseId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const latestExtraction = extractions[extractions.length - 1];
  const pendingExtraction = latestExtraction?.status === 'pending_review' ? latestExtraction : undefined;
  const confirmedExtraction = extractions.find((e) => e.status === 'confirmed');

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That action failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!referralCase) {
    return (
      <main style={{ maxWidth: 800, margin: '0 auto', padding: 'var(--rp-space-5)' }}>
        {error ? <p style={{ color: 'var(--rp-color-urgent-500)' }}>{error}</p> : <p>Loading…</p>}
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 'var(--rp-space-5)' }}>
      <Card>
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
          <p style={{ color: 'var(--rp-color-text-muted)', fontSize: 'var(--rp-font-size-sm)' }}>
            Patient {referralCase.patientId} · Referring GP {referralCase.gpId} · Received{' '}
            {new Date(referralCase.receivedAt).toLocaleString('en-AU')}
          </p>
          {error && <p style={{ color: 'var(--rp-color-urgent-500)' }}>{error}</p>}
        </CardBody>
      </Card>

      {/* AI-assisted extraction summary shown first — full letter only one click away. */}
      <Card style={{ marginTop: 'var(--rp-space-4)' }}>
        <CardHeader>
          <CardTitle>AI-assisted extraction summary</CardTitle>
        </CardHeader>
        <CardBody>
          {latestExtraction ? (
            <>
              <StructuredSummary extraction={latestExtraction} />
              <p
                style={{
                  fontSize: 'var(--rp-font-size-sm)',
                  color: 'var(--rp-color-text-muted)',
                  marginTop: 'var(--rp-space-2)',
                }}
              >
                Provider: {latestExtraction.providerName}
                {typeof latestExtraction.confidence === 'number'
                  ? ` · ${Math.round(latestExtraction.confidence * 100)}% confidence`
                  : ''}
                {' · '}Status: {latestExtraction.status}
              </p>
            </>
          ) : (
            <p style={{ color: 'var(--rp-color-text-muted)' }}>No extraction has been run yet.</p>
          )}

          <button
            type="button"
            onClick={() => setShowFullLetter((v) => !v)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--rp-color-primary-600)',
              cursor: 'pointer',
              padding: 0,
              marginTop: 'var(--rp-space-2)',
            }}
          >
            {showFullLetter ? 'Hide full referral letter' : 'View full referral letter'}
          </button>
          {showFullLetter && (
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                background: 'var(--rp-color-bg-subtle)',
                border: '1px solid var(--rp-color-border)',
                borderRadius: 'var(--rp-radius-md)',
                padding: 'var(--rp-space-3)',
                marginTop: 'var(--rp-space-2)',
                fontFamily: 'var(--rp-font-family)',
              }}
            >
              {referralCase.referralText}
            </pre>
          )}

          <div style={{ marginTop: 'var(--rp-space-3)', display: 'flex', gap: 'var(--rp-space-2)' }}>
            {(referralCase.status === 'received' || referralCase.status === 'extracted') && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => withBusy(async () => void (await runExtraction(accessToken, referralCase.id)))}
              >
                {latestExtraction ? 'Re-run extraction' : 'Run extraction'}
              </Button>
            )}
          </div>

          {pendingExtraction && (
            <ConfirmExtractionForm
              extraction={pendingExtraction}
              busy={busy}
              onConfirm={(edits, note) =>
                withBusy(
                  async () =>
                    void (await confirmExtraction(accessToken, referralCase.id, pendingExtraction.id, edits, note)),
                )
              }
              onReject={(reason) =>
                withBusy(
                  async () => void (await rejectExtraction(accessToken, referralCase.id, pendingExtraction.id, reason)),
                )
              }
            />
          )}
        </CardBody>
      </Card>

      {/* Referral decision — accept / respond with advice / cancel-with-reason. Gated on a confirmed extraction, per the backend's own enforcement. */}
      <Card style={{ marginTop: 'var(--rp-space-4)' }}>
        <CardHeader>
          <CardTitle>Referral decision</CardTitle>
        </CardHeader>
        <CardBody>
          {referralCase.status === 'extraction_confirmed' && confirmedExtraction ? (
            <DecisionForm
              busy={busy}
              onAccept={() =>
                withBusy(async () => void (await decideBranch(accessToken, referralCase.id, 'full_appointment')))
              }
              onRespondWithAdvice={(adviceText) =>
                withBusy(async () => void (await decideBranch(accessToken, referralCase.id, 'econsult', adviceText)))
              }
            />
          ) : (
            <p style={{ color: 'var(--rp-color-text-muted)' }}>
              Confirm the AI-assisted extraction above before deciding — this is enforced by the Specialist Review
              Service itself, not just this screen.
            </p>
          )}

          {decisions.length > 0 && (
            <ul style={{ marginTop: 'var(--rp-space-3)', paddingLeft: 'var(--rp-space-4)' }}>
              {decisions.map((d) => (
                <li key={d.id}>
                  {d.branch === 'econsult' ? 'Resolved via eConsult advice' : 'Decided: full appointment'} —{' '}
                  {new Date(d.decidedAt).toLocaleString('en-AU')}
                  {d.adviceText && <p style={{ margin: 0, fontStyle: 'italic' }}>“{d.adviceText}”</p>}
                </li>
              ))}
            </ul>
          )}

          {referralCase.status === 'full_appointment' && (
            <div style={{ marginTop: 'var(--rp-space-3)' }}>
              <Button asChild variant="secondary">
                <Link href="/bookings">Go to bookings & calendar</Link>
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Pre-visit pathology/imaging requests — module 5's "S5". */}
      <Card style={{ marginTop: 'var(--rp-space-4)' }}>
        <CardHeader>
          <CardTitle>Pre-visit pathology / imaging requests</CardTitle>
        </CardHeader>
        <CardBody>
          {pathologyRequests.map((p) => (
            <p key={p.id} style={{ margin: '4px 0' }}>
              {p.requestType === 'pathology' ? 'Pathology' : 'Imaging'}: {p.testsRequested.join(', ')} — {p.status}
              {p.mockProviderReference ? ` (ref: ${p.mockProviderReference})` : ''}
            </p>
          ))}
          {confirmedExtraction ? (
            <PathologyRequestForm
              busy={busy}
              onSubmit={(requestType, tests, notes) =>
                withBusy(
                  async () => void (await requestPathology(accessToken, referralCase.id, requestType, tests, notes)),
                )
              }
            />
          ) : (
            <p style={{ color: 'var(--rp-color-text-muted)' }}>Available once the extraction is confirmed.</p>
          )}
        </CardBody>
      </Card>

      <Card style={{ marginTop: 'var(--rp-space-4)' }}>
        <CardHeader>
          <CardTitle>Wrap up</CardTitle>
        </CardHeader>
        <CardBody>
          <div style={{ display: 'flex', gap: 'var(--rp-space-2)', flexWrap: 'wrap' }}>
            <Button asChild variant="primary">
              <Link
                href={`/followup-plans/new?referralId=${referralCase.referralId}&patientId=${referralCase.patientId}&gpId=${referralCase.gpId}`}
              >
                Create Follow-up Plan
              </Link>
            </Button>
            {(referralCase.status === 'resolved_econsult' || referralCase.status === 'full_appointment') && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => withBusy(async () => void (await completeCase(accessToken, referralCase.id)))}
              >
                Mark case completed
              </Button>
            )}
            {referralCase.status !== 'completed' && referralCase.status !== 'cancelled' && (
              <CancelCaseButton
                busy={busy}
                onCancel={(reason) =>
                  withBusy(async () => {
                    await cancelCase(accessToken, referralCase.id, reason);
                    router.push('/queue');
                  })
                }
              />
            )}
          </div>
        </CardBody>
      </Card>
    </main>
  );
}

function StructuredSummary({ extraction }: { extraction: ExtractionResult }) {
  const data = extraction.structuredData;
  const entries = Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0)
    return <p style={{ color: 'var(--rp-color-text-muted)' }}>No structured fields were extracted.</p>;
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px var(--rp-space-3)', margin: 0 }}>
      {entries.map(([key, value]) => (
        <React.Fragment key={key}>
          <dt style={{ color: 'var(--rp-color-text-muted)', fontSize: 'var(--rp-font-size-sm)' }}>{key}</dt>
          <dd style={{ margin: 0 }}>{typeof value === 'string' ? value : JSON.stringify(value)}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function ConfirmExtractionForm({
  extraction,
  busy,
  onConfirm,
  onReject,
}: {
  extraction: ExtractionResult;
  busy: boolean;
  onConfirm: (edits?: Record<string, unknown>, note?: string) => void;
  onReject: (reason: string) => void;
}) {
  const [note, setNote] = React.useState('');
  const [rejectReason, setRejectReason] = React.useState('');
  const [showReject, setShowReject] = React.useState(false);

  return (
    <div
      style={{
        marginTop: 'var(--rp-space-3)',
        borderTop: '1px solid var(--rp-color-border)',
        paddingTop: 'var(--rp-space-3)',
      }}
    >
      <p style={{ fontWeight: 'var(--rp-font-weight-medium)' }}>
        This is AI-assisted output — confirm it&apos;s accurate before it can be acted on. Nothing downstream happens
        until you do.
      </p>
      <FormField
        id="confirm-note"
        label="Note (optional)"
        hint="Recorded alongside your confirmation, separate from the AI's original output."
      >
        <input
          id="confirm-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ ...textAreaStyle, minHeight: 40 }}
        />
      </FormField>
      <div style={{ display: 'flex', gap: 'var(--rp-space-2)' }}>
        <Button variant="primary" disabled={busy} onClick={() => onConfirm(undefined, note || undefined)}>
          Confirm extraction is accurate
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => setShowReject((v) => !v)}>
          Reject
        </Button>
      </div>
      {showReject && (
        <div style={{ marginTop: 'var(--rp-space-2)' }}>
          <FormField id="reject-reason" label="Why is this extraction unusable?" required>
            <input
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              style={{ ...textAreaStyle, minHeight: 40 }}
            />
          </FormField>
          <Button variant="urgent" disabled={busy || !rejectReason} onClick={() => onReject(rejectReason)}>
            Reject extraction {extraction.id.slice(0, 6)}
          </Button>
        </div>
      )}
    </div>
  );
}

function DecisionForm({
  busy,
  onAccept,
  onRespondWithAdvice,
}: {
  busy: boolean;
  onAccept: () => void;
  onRespondWithAdvice: (adviceText: string) => void;
}) {
  const [advice, setAdvice] = React.useState('');
  const [showAdvice, setShowAdvice] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-2)' }}>
      <div style={{ display: 'flex', gap: 'var(--rp-space-2)' }}>
        <Button variant="primary" disabled={busy} onClick={onAccept}>
          Accept — proceed to full appointment
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => setShowAdvice((v) => !v)}>
          Respond with advice (eConsult)
        </Button>
      </div>
      {showAdvice && (
        <div>
          <FormField
            id="advice-text"
            label="Advice for the GP/patient"
            required
            hint="Resolves this referral without a full appointment."
          >
            <textarea
              id="advice-text"
              value={advice}
              onChange={(e) => setAdvice(e.target.value)}
              rows={4}
              style={textAreaStyle}
            />
          </FormField>
          <Button variant="primary" disabled={busy || !advice.trim()} onClick={() => onRespondWithAdvice(advice)}>
            Send advice & resolve
          </Button>
        </div>
      )}
    </div>
  );
}

function PathologyRequestForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (requestType: 'pathology' | 'imaging', tests: string[], notes?: string) => void;
}) {
  const [requestType, setRequestType] = React.useState<'pathology' | 'imaging'>('pathology');
  const [testsText, setTestsText] = React.useState('');
  const [notes, setNotes] = React.useState('');

  const submit = () => {
    const tests = testsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (tests.length === 0) return;
    onSubmit(requestType, tests, notes || undefined);
    setTestsText('');
    setNotes('');
  };

  return (
    <div
      style={{
        marginTop: 'var(--rp-space-3)',
        borderTop: '1px solid var(--rp-color-border)',
        paddingTop: 'var(--rp-space-3)',
      }}
    >
      <FormField id="pathology-type" label="Type">
        <select
          id="pathology-type"
          value={requestType}
          onChange={(e) => setRequestType(e.target.value as 'pathology' | 'imaging')}
          style={{ ...textAreaStyle, minHeight: 40 }}
        >
          <option value="pathology">Pathology</option>
          <option value="imaging">Imaging</option>
        </select>
      </FormField>
      <FormField id="pathology-tests" label="Tests requested" hint="Comma-separated, e.g. FBC, LFTs, CRP" required>
        <input
          id="pathology-tests"
          value={testsText}
          onChange={(e) => setTestsText(e.target.value)}
          style={{ ...textAreaStyle, minHeight: 40 }}
        />
      </FormField>
      <FormField id="pathology-notes" label="Clinical notes (optional)">
        <textarea
          id="pathology-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          style={textAreaStyle}
        />
      </FormField>
      <Button variant="secondary" disabled={busy || !testsText.trim()} onClick={submit}>
        Submit request
      </Button>
    </div>
  );
}

function CancelCaseButton({ busy, onCancel }: { busy: boolean; onCancel: (reason?: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');

  if (!open) {
    return (
      <Button variant="urgent" disabled={busy} onClick={() => setOpen(true)}>
        Cancel case
      </Button>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 'var(--rp-space-2)', alignItems: 'center' }}>
      <input
        aria-label="Cancellation reason"
        placeholder="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ ...textAreaStyle, minHeight: 40, width: 220 }}
      />
      <Button variant="urgent" disabled={busy} onClick={() => onCancel(reason || undefined)}>
        Confirm cancel
      </Button>
    </div>
  );
}
