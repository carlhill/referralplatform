'use client';

import * as React from 'react';
import { Button, Card, CardBody, CardHeader, CardTitle, FormField, StatusBadge } from '@referralplatform/ui-components';
import { RequireAuth } from '../../components/RequireAuth';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { useAuth } from '../../lib/auth/AuthContext';
import {
  grantConsent,
  listConsentRecords,
  listLinkedGps,
  revokeConsent,
  revokeLinkedGp,
} from '../../lib/api/consentSecurity';
import { listPasskeys, requirePasskeyReenrolment, revokePasskey } from '../../lib/api/passkeys';
import type { ConsentRecord, LinkedGp, Passkey, SensitiveCategory } from '../../lib/api/types';
import { gpLinkStatusDisplay } from '../../lib/ui/status';

const SENSITIVE_CATEGORIES: Array<{ value: SensitiveCategory; label: string }> = [
  { value: 'sexual_health', label: 'Sexual health' },
  { value: 'mental_health', label: 'Mental health' },
  { value: 'reproductive_health', label: 'Reproductive health' },
  { value: 'drug_and_alcohol', label: 'Drug & alcohol' },
];

function LinkedGpsPanel() {
  const auth = useAuth();
  const [links, setLinks] = React.useState<LinkedGp[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!auth.accessToken || !auth.principal) return;
    setError(null);
    try {
      setLinks(await listLinkedGps(auth.accessToken, auth.principal.sub));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load linked GPs.');
    }
  }, [auth.accessToken, auth.principal]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function onRevoke(id: string) {
    if (!auth.accessToken) return;
    setBusyId(id);
    try {
      await revokeLinkedGp(auth.accessToken, id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke access.');
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!links) return <LoadingState label="Loading linked GPs…" />;

  const active = links.filter((l) => l.status === 'approved');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked GPs & practices</CardTitle>
      </CardHeader>
      <CardBody>
        {active.length === 0 ? (
          <p>No GPs currently have access to your referral history.</p>
        ) : (
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
            {active.map((l) => {
              const { label, tone } = gpLinkStatusDisplay(l.status);
              return (
                <li
                  key={l.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 'var(--rp-space-2)',
                  }}
                >
                  <span>
                    GP {l.gpId} — practice {l.practiceHpiO}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--rp-space-2)' }}>
                    <StatusBadge tone={tone} label={label} />
                    <Button variant="secondary" onClick={() => onRevoke(l.id)} disabled={busyId === l.id}>
                      Revoke access
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function SensitiveCategoryAccessPanel() {
  const auth = useAuth();
  const [records, setRecords] = React.useState<ConsentRecord[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState<SensitiveCategory>('mental_health');
  const [carerId, setCarerId] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!auth.accessToken || !auth.principal) return;
    setError(null);
    try {
      setRecords(await listConsentRecords(auth.accessToken, auth.principal.sub, 'sensitive_category_access'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load sensitive-category access grants.');
    }
  }, [auth.accessToken, auth.principal]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function onGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.accessToken || !auth.principal || !carerId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await grantConsent(auth.accessToken, {
        patientId: auth.principal.sub,
        subjectType: 'sensitive_category_access',
        subjectId: carerId.trim(),
        sensitiveCategory: category,
      });
      setCarerId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not grant access.');
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string) {
    if (!auth.accessToken) return;
    setBusy(true);
    try {
      await revokeConsent(auth.accessToken, id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke access.');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!records) return <LoadingState label="Loading…" />;

  const active = records.filter((r) => !r.revokedAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sensitive-category access for your carers</CardTitle>
      </CardHeader>
      <CardBody>
        <p style={{ fontSize: 'var(--rp-font-size-sm)', color: 'var(--rp-color-text-muted)' }}>
          Referrals in these categories are hidden from a carer/delegate by default. Grant access here only if you want
          a specific carer to see them.
        </p>
        {active.length === 0 ? (
          <p>No sensitive-category access currently granted.</p>
        ) : (
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
            {active.map((r) => (
              <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  Carer {r.subjectId} — {r.sensitiveCategory?.replace(/_/g, ' ')}
                </span>
                <Button variant="secondary" onClick={() => onRevoke(r.id)} disabled={busy}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={onGrant}
          style={{
            display: 'flex',
            gap: 'var(--rp-space-2)',
            alignItems: 'flex-end',
            marginTop: 'var(--rp-space-3)',
            flexWrap: 'wrap',
          }}
        >
          <FormField id="carerId" label="Carer id">
            <input value={carerId} onChange={(e) => setCarerId(e.target.value)} required />
          </FormField>
          <FormField id="category" label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value as SensitiveCategory)}>
              {SENSITIVE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </FormField>
          <Button type="submit" variant="primary" disabled={busy}>
            Grant access
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function PasskeysPanel() {
  const auth = useAuth();
  const [passkeys, setPasskeys] = React.useState<Passkey[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!auth.accessToken) return;
    setError(null);
    try {
      setPasskeys(await listPasskeys(auth.accessToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your passkeys.');
    }
  }, [auth.accessToken]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function onRevoke(credentialId: string) {
    if (!auth.accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await revokePasskey(auth.accessToken, credentialId);
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} — this action requires a recent passkey sign-in. Sign out and back in, then retry.`
          : 'Could not revoke this passkey.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onLostDevice() {
    if (!auth.accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await requirePasskeyReenrolment(auth.accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not flag your account for re-enrolment.');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!passkeys) return <LoadingState label="Loading passkeys…" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passkeys & sign-in security</CardTitle>
      </CardHeader>
      <CardBody>
        <p style={{ fontSize: 'var(--rp-font-size-sm)', color: 'var(--rp-color-text-muted)' }}>
          A passkey uses your device&apos;s fingerprint, face, or screen lock instead of a password — it&apos;s faster
          and can&apos;t be phished. A one-time code (email/SMS) plus password remains available as a fallback.
        </p>
        {passkeys.length === 0 ? (
          <p>No passkeys registered yet.</p>
        ) : (
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
            {passkeys.map((p) => (
              <li
                key={p.credentialId}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>
                  {p.deviceLabel ?? 'Passkey'} — added {new Date(p.createdAt).toLocaleDateString('en-AU')}
                </span>
                <Button variant="secondary" onClick={() => onRevoke(p.credentialId)} disabled={busy}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button variant="ghost" onClick={onLostDevice} disabled={busy} style={{ marginTop: 'var(--rp-space-3)' }}>
          Lost your device? Require re-enrolment on next sign-in
        </Button>
      </CardBody>
    </Card>
  );
}

function ConsentContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-4)' }}>
      <LinkedGpsPanel />
      <SensitiveCategoryAccessPanel />
      <PasskeysPanel />
    </div>
  );
}

export default function ConsentPage() {
  return (
    <RequireAuth>
      <ConsentContent />
    </RequireAuth>
  );
}
