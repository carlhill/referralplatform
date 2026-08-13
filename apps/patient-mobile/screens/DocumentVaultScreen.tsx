import * as React from 'react';
import { View } from 'react-native';
import { Body, Button, Card, CardTitle, ErrorState, LoadingState, MutedText, StatusBadge } from '../components/ui';
import { AppShell } from './AppShell';
import { useAuth } from '../lib/auth/AuthContext';
import { listReferrals } from '../lib/api/referral';
import type { Referral } from '../lib/api/types';

/**
 * Document vault — MOCK / documented gap, same as
 * apps/patient-web/app/documents/page.tsx: no dedicated document-storage
 * service exists in this build yet (not in root CONVENTIONS.md §1's
 * service list). This derives a "document" per referral from data the
 * Referral Service already has and shows it inline (no `expo-file-system`/
 * `expo-sharing` dependency added just for this placeholder — a real
 * document store would replace this view entirely, not extend it). See
 * BUILD_LOG/patient-app.md.
 */
function buildDocumentText(r: Referral): string {
  const lines = [
    `Referral ID: ${r.id}`,
    `Created: ${new Date(r.createdAt).toLocaleString('en-AU')}`,
    `Status: ${r.status}`,
    '',
    r.reasonForReferral,
  ];
  return lines.join('\n');
}

function DocumentsContent() {
  const auth = useAuth();
  const [referrals, setReferrals] = React.useState<Referral[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!auth.accessToken || !auth.principal) return;
    setError(null);
    try {
      setReferrals(await listReferrals(auth.accessToken, { patientId: auth.principal.sub }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your documents.');
    }
  }, [auth.accessToken, auth.principal]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!referrals) return <LoadingState label="Loading documents…" />;

  return (
    <Card>
      <CardTitle>Document vault</CardTitle>
      <StatusBadge tone="neutral" label="Referral letters shown here — specialist letters & results coming soon" />
      {referrals.length === 0 ? (
        <MutedText>No documents yet.</MutedText>
      ) : (
        referrals.map((r) => (
          <View key={r.id} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#eee', gap: 6 }}>
            <Body>Referral letter — {new Date(r.createdAt).toLocaleDateString('en-AU')}</Body>
            <MutedText>{r.reasonForReferral.slice(0, 60)}</MutedText>
            <Button variant="secondary" onPress={() => setExpandedId(expandedId === r.id ? null : r.id)}>
              {expandedId === r.id ? 'Hide' : 'View'}
            </Button>
            {expandedId === r.id && (
              <View style={{ backgroundColor: '#f4f6f7', borderRadius: 8, padding: 8 }}>
                <Body>{buildDocumentText(r)}</Body>
              </View>
            )}
          </View>
        ))
      )}
    </Card>
  );
}

export function DocumentVaultScreen() {
  return (
    <AppShell>
      <DocumentsContent />
    </AppShell>
  );
}
