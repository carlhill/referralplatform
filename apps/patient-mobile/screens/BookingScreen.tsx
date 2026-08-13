import * as React from 'react';
import { View } from 'react-native';
import {
  Body,
  Button,
  Card,
  CardTitle,
  ErrorState,
  LoadingState,
  MutedText,
  RadioOption,
  StatusBadge,
} from '../components/ui';
import { AppShell } from './AppShell';
import { useAuth } from '../lib/auth/AuthContext';
import { getReferral } from '../lib/api/referral';
import { candidateSlots, confirmBooking, createBooking, listBookings } from '../lib/api/booking';
import type { Booking, CandidateSlot, Referral } from '../lib/api/types';
import { bookingStatusDisplay } from '../lib/ui/status';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const TIME_BANDS = ['morning', 'afternoon', 'evening'] as const;

function BookingContent({ referralId }: { referralId: string }) {
  const auth = useAuth();
  const [referral, setReferral] = React.useState<Referral | null>(null);
  const [booking, setBooking] = React.useState<Booking | null>(null);
  const [slots, setSlots] = React.useState<CandidateSlot[] | null>(null);
  const [preferredDayOfWeek, setPreferredDayOfWeek] = React.useState<string>('');
  const [preferredTimeOfDay, setPreferredTimeOfDay] = React.useState<'morning' | 'afternoon' | 'evening' | ''>('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!auth.accessToken || !auth.principal) return;
    setError(null);
    try {
      const r = await getReferral(auth.accessToken, referralId);
      setReferral(r);
      const existing = await listBookings(auth.accessToken, { referralId });
      const current = existing.find((b) => b.status !== 'cancelled') ?? null;
      setBooking(current);
      if (current) setSlots(await candidateSlots(auth.accessToken, current.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load booking details.');
    }
  }, [auth.accessToken, auth.principal, referralId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function onSubmitPreference() {
    if (!auth.accessToken || !auth.principal || !referral?.specialistId) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createBooking(auth.accessToken, {
        referralId,
        patientId: auth.principal.sub,
        specialistId: referral.specialistId,
        urgentFastPath: referral.urgent,
        preferredDayOfWeek: referral.urgent ? undefined : preferredDayOfWeek || undefined,
        preferredTimeOfDay: referral.urgent ? undefined : ((preferredTimeOfDay || undefined) as any),
      });
      setBooking(created);
      setSlots(await candidateSlots(auth.accessToken, created.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your preference.');
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmSlot(slotId: string) {
    if (!auth.accessToken || !booking) return;
    setBusy(true);
    setError(null);
    try {
      setBooking(await confirmBooking(auth.accessToken, booking.id, slotId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That slot may already be taken — try another.');
      setSlots(await candidateSlots(auth.accessToken, booking.id));
    } finally {
      setBusy(false);
    }
  }

  if (error && !referral) return <ErrorState message={error} onRetry={load} />;
  if (!referral) return <LoadingState label="Loading…" />;

  if (!referral.specialistId) {
    return (
      <Card>
        <CardTitle>Booking</CardTitle>
        <Body>Your GP hasn&apos;t assigned a specific specialist yet — check back soon.</Body>
      </Card>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {error && <ErrorState message={error} />}

      {!booking && (
        <Card>
          <CardTitle>When works best for you?</CardTitle>
          {referral.urgent ? (
            <Body>This referral is urgent — we&apos;ll offer the earliest available appointment.</Body>
          ) : (
            <>
              <Body>Preferred day</Body>
              {DAYS.map((d) => (
                <RadioOption
                  key={d}
                  label={d[0].toUpperCase() + d.slice(1)}
                  selected={preferredDayOfWeek === d}
                  onPress={() => setPreferredDayOfWeek(d)}
                />
              ))}
              <Body style={{ marginTop: 8 }}>Preferred time</Body>
              {TIME_BANDS.map((t) => (
                <RadioOption
                  key={t}
                  label={t[0].toUpperCase() + t.slice(1)}
                  selected={preferredTimeOfDay === t}
                  onPress={() => setPreferredTimeOfDay(t)}
                />
              ))}
            </>
          )}
          <Button variant="primary" onPress={onSubmitPreference} disabled={busy}>
            {busy ? 'Saving…' : 'Find matching appointments'}
          </Button>
        </Card>
      )}

      {booking && (
        <Card>
          <CardTitle>Your booking</CardTitle>
          {(() => {
            const { label, tone } = bookingStatusDisplay(booking.status);
            return <StatusBadge tone={tone} label={label} />;
          })()}
          {booking.confirmedSlotStartsAt && (
            <Body>Confirmed for {new Date(booking.confirmedSlotStartsAt).toLocaleString('en-AU')}</Body>
          )}
          {booking.status === 'preference_captured' && slots && slots.length > 0 && (
            <>
              <Body>Available appointment times:</Body>
              {slots.map((s) => (
                <View
                  key={s.slotId}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingVertical: 4,
                  }}
                >
                  <Body>{new Date(s.startsAt).toLocaleString('en-AU')}</Body>
                  <Button variant="secondary" onPress={() => onConfirmSlot(s.slotId)} disabled={busy}>
                    Book
                  </Button>
                </View>
              ))}
            </>
          )}
          {booking.status === 'preference_captured' && slots && slots.length === 0 && (
            <MutedText>No matching times yet — you&apos;ve been placed on the waitlist.</MutedText>
          )}
        </Card>
      )}
    </View>
  );
}

export function BookingScreen({ referralId }: { referralId: string }) {
  return (
    <AppShell>
      <BookingContent referralId={referralId} />
    </AppShell>
  );
}
