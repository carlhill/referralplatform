import * as React from 'react';
import { View } from 'react-native';
import {
  Body,
  Button,
  Card,
  CardTitle,
  ErrorState,
  Field,
  LoadingState,
  MutedText,
  RadioOption,
  StatusBadge,
} from '../components/ui';
import { AppShell } from './AppShell';
import { useAuth } from '../lib/auth/AuthContext';
import {
  grantConsent,
  listConsentRecords,
  listLinkedGps,
  revokeConsent,
  revokeLinkedGp,
} from '../lib/api/consentSecurity';
import { listPasskeys, requirePasskeyReenrolment, revokePasskey } from '../lib/api/passkeys';
import type { ConsentRecord, LinkedGp, Passkey, SensitiveCategory } from '../lib/api/types';
import { gpLinkStatusDisplay } from '../lib/ui/status';
import { getBiometricAvailability } from '../lib/auth/biometricLock';

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
      <CardTitle>Linked GPs & practices</CardTitle>
      {active.length === 0 ? (
        <MutedText>No GPs currently have access to your referral history.</MutedText>
      ) : (
        active.map((l) => {
          const { label, tone } = gpLinkStatusDisplay(l.status);
          return (
            <View key={l.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#eee', gap: 6 }}>
              <Body>
                GP {l.gpId} — practice {l.practiceHpiO}
              </Body>
              <StatusBadge tone={tone} label={label} />
              <Button variant="secondary" onPress={() => onRevoke(l.id)} disabled={busyId === l.id}>
                Revoke access
              </Button>
            </View>
          );
        })
      )}
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
      setError(err instanceof Error ? err.message : 'Could not load access grants.');
    }
  }, [auth.accessToken, auth.principal]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function onGrant() {
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
      <CardTitle>Sensitive-category access for your carers</CardTitle>
      <MutedText>Hidden from carers by default — grant access only if you want a specific carer to see it.</MutedText>
      {active.map((r) => (
        <View
          key={r.id}
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}
        >
          <Body>
            Carer {r.subjectId} — {r.sensitiveCategory?.replace(/_/g, ' ')}
          </Body>
          <Button variant="secondary" onPress={() => onRevoke(r.id)} disabled={busy}>
            Revoke
          </Button>
        </View>
      ))}
      <Field label="Carer id" value={carerId} onChangeText={setCarerId} />
      <Body>Category</Body>
      {SENSITIVE_CATEGORIES.map((c) => (
        <RadioOption
          key={c.value}
          label={c.label}
          selected={category === c.value}
          onPress={() => setCategory(c.value)}
        />
      ))}
      <Button variant="primary" onPress={onGrant} disabled={busy || !carerId.trim()}>
        Grant access
      </Button>
    </Card>
  );
}

function PasskeysPanel() {
  const auth = useAuth();
  const [passkeys, setPasskeys] = React.useState<Passkey[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [biometricAvailable, setBiometricAvailable] = React.useState<boolean | null>(null);

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
    getBiometricAvailability().then((a) => setBiometricAvailable(a.hasHardware && a.isEnrolled));
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
        err instanceof Error ? `${err.message} — requires a recent passkey sign-in.` : 'Could not revoke this passkey.',
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
      <CardTitle>Passkeys & sign-in security</CardTitle>
      <MutedText>
        {biometricAvailable
          ? 'This device supports app-lock via biometrics as well as passkey sign-in.'
          : 'A one-time code plus password remains available as a fallback wherever passkeys aren’t supported.'}
      </MutedText>
      {passkeys.length === 0 ? (
        <MutedText>No passkeys registered yet.</MutedText>
      ) : (
        passkeys.map((p) => (
          <View
            key={p.credentialId}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}
          >
            <Body>{p.deviceLabel ?? 'Passkey'}</Body>
            <Button variant="secondary" onPress={() => onRevoke(p.credentialId)} disabled={busy}>
              Remove
            </Button>
          </View>
        ))
      )}
      <Button variant="ghost" onPress={onLostDevice} disabled={busy}>
        Lost your device? Require re-enrolment
      </Button>
    </Card>
  );
}

function ConsentContent() {
  return (
    <View style={{ gap: 16 }}>
      <LinkedGpsPanel />
      <SensitiveCategoryAccessPanel />
      <PasskeysPanel />
    </View>
  );
}

export function ConsentSecurityScreen() {
  return (
    <AppShell>
      <ConsentContent />
    </AppShell>
  );
}
