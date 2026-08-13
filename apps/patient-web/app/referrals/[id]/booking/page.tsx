'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, CardBody, CardHeader, CardTitle, FormField, StatusBadge } from '@referralplatform/ui-components';
import { RequireAuth } from '../../../../components/RequireAuth';
import { LoadingState } from '../../../../components/LoadingState';
import { ErrorState } from '../../../../components/ErrorState';
import { useAuth } from '../../../../lib/auth/AuthContext';
import { getReferral } from '../../../../lib/api/referral';
import { candidateSlots, confirmBooking, createBooking, listBookings } from '../../../../lib/api/booking';
import type { Booking, CandidateSlot, Referral } from '../../../../lib/api/types';
import { bookingStatusDisplay } from '../../../../lib/ui/status';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const TIME_BANDS = ['morning', 'afternoon', 'evening'] as const;

function BookingCapture({ referralId }: { referralId: string }) {
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
      if (current) {
        setSlots(await candidateSlots(auth.accessToken, current.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load booking details.');
    }
  }, [auth.accessToken, auth.principal, referralId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function onSubmitPreference(e: React.FormEvent) {
    e.preventDefault();
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
        preferredTimeOfDay: referral.urgent
          ? undefined
          : ((preferredTimeOfDay || undefined) as 'morning' | 'afternoon' | 'evening' | undefined),
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
      if (auth.accessToken) setSlots(await candidateSlots(auth.accessToken, booking.id));
    } finally {
      setBusy(false);
    }
  }

  if (error && !referral) return <ErrorState message={error} onRetry={load} />;
  if (!referral) return <LoadingState label="Loading…" />;

  if (!referral.specialistId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Booking</CardTitle>
        </CardHeader>
        <CardBody>
          <p>
            Your GP hasn&apos;t assigned a specific specialist to this referral yet — booking preferences will be
            available once one is matched. Check back soon, or ask your GP.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-4)' }}>
      {error && <ErrorState message={error} />}

      {!booking && (
        <Card>
          <CardHeader>
            <CardTitle>When works best for you?</CardTitle>
          </CardHeader>
          <CardBody>
            {referral.urgent ? (
              <p>
                This referral is marked urgent — we&apos;ll offer you the earliest available appointment rather than
                asking for a day/time preference.
              </p>
            ) : (
              <form onSubmit={onSubmitPreference}>
                <FormField id="day" label="Preferred day of the week">
                  <select value={preferredDayOfWeek} onChange={(e) => setPreferredDayOfWeek(e.target.value)}>
                    <option value="">No preference</option>
                    {DAYS.map((d) => (
                      <option key={d} value={d}>
                        {d[0].toUpperCase() + d.slice(1)}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField id="time" label="Preferred time of day">
                  <select
                    value={preferredTimeOfDay}
                    onChange={(e) => setPreferredTimeOfDay(e.target.value as typeof preferredTimeOfDay)}
                  >
                    <option value="">No preference</option>
                    {TIME_BANDS.map((t) => (
                      <option key={t} value={t}>
                        {t[0].toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                </FormField>
              </form>
            )}
            <Button
              variant="primary"
              onClick={onSubmitPreference}
              disabled={busy}
              style={{ marginTop: 'var(--rp-space-2)' }}
            >
              {busy ? 'Saving…' : 'Find matching appointments'}
            </Button>
          </CardBody>
        </Card>
      )}

      {booking && (
        <Card>
          <CardHeader>
            <CardTitle>Your booking</CardTitle>
          </CardHeader>
          <CardBody>
            {(() => {
              const { label, tone } = bookingStatusDisplay(booking.status);
              return <StatusBadge tone={tone} label={label} />;
            })()}
            {booking.confirmedSlotStartsAt && (
              <p style={{ marginTop: 'var(--rp-space-2)' }}>
                Confirmed for {new Date(booking.confirmedSlotStartsAt).toLocaleString('en-AU')}
              </p>
            )}
            {booking.status === 'preference_captured' && slots && slots.length > 0 && (
              <>
                <p style={{ marginTop: 'var(--rp-space-3)' }}>Available appointment times:</p>
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
                  {slots.map((s) => (
                    <li
                      key={s.slotId}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <span>{new Date(s.startsAt).toLocaleString('en-AU')}</span>
                      <Button variant="secondary" onClick={() => onConfirmSlot(s.slotId)} disabled={busy}>
                        Book this time
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {booking.status === 'preference_captured' && slots && slots.length === 0 && (
              <p style={{ marginTop: 'var(--rp-space-2)' }}>
                No matching times yet — you&apos;ve been placed on the waitlist and we&apos;ll notify you as slots open
                up.
              </p>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export default function BookingPage() {
  const params = useParams<{ id: string }>();
  return (
    <RequireAuth>
      <BookingCapture referralId={params.id} />
    </RequireAuth>
  );
}
