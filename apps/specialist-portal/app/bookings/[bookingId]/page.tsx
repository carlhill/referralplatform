'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, CardBody, CardHeader, CardTitle } from '@referralplatform/ui-components';
import { RequireAuth } from '../../components/RequireAuth';
import { StatusPill } from '../../components/StatusPill';
import { useAuth } from '../../lib/auth/AuthContext';
import { cancelBooking, getBooking } from '../../lib/api/bookingApi';
import type { Booking } from '@referralplatform/shared-types';

export default function BookingDetailPage() {
  return (
    <RequireAuth>
      <BookingDetailContent />
    </RequireAuth>
  );
}

function BookingDetailContent() {
  const params = useParams<{ bookingId: string }>();
  const router = useRouter();
  const { accessToken } = useAuth();
  const [booking, setBooking] = React.useState<Booking | null>(null);
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setBooking(await getBooking(accessToken, params.bookingId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load this booking.');
    }
  }, [accessToken, params.bookingId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!booking) {
    return (
      <main style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--rp-space-5)' }}>
        {error ? <p style={{ color: 'var(--rp-color-urgent-500)' }}>{error}</p> : <p>Loading…</p>}
      </main>
    );
  }

  const cancellable =
    booking.status === 'confirmed' || booking.status === 'preference_captured' || booking.status === 'waitlisted';

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--rp-space-5)' }}>
      <Card>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <CardTitle>Booking</CardTitle>
            <StatusPill status={booking.status} />
          </div>
        </CardHeader>
        <CardBody>
          <p>Patient: {booking.patientId}</p>
          <p>Referral: {booking.referralId}</p>
          {booking.confirmedSlotStartsAt && (
            <p>
              Confirmed slot: {new Date(booking.confirmedSlotStartsAt).toLocaleString('en-AU')} –{' '}
              {booking.confirmedSlotEndsAt && new Date(booking.confirmedSlotEndsAt).toLocaleTimeString('en-AU')}
            </p>
          )}
          {booking.urgentFastPath && <StatusPill status="urgent" />}
          {error && <p style={{ color: 'var(--rp-color-urgent-500)' }}>{error}</p>}

          {cancellable && (
            <div
              style={{
                marginTop: 'var(--rp-space-4)',
                borderTop: '1px solid var(--rp-color-border)',
                paddingTop: 'var(--rp-space-3)',
              }}
            >
              <input
                aria-label="Cancellation reason"
                placeholder="Reason (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{
                  minHeight: 'var(--rp-touch-target-min)',
                  padding: '0 8px',
                  border: '1px solid var(--rp-color-border)',
                  borderRadius: 'var(--rp-radius-md)',
                  marginRight: 'var(--rp-space-2)',
                  width: 260,
                }}
              />
              <Button
                variant="urgent"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await cancelBooking(accessToken, booking.id, reason || undefined);
                    router.push('/bookings');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to cancel this booking.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Cancel booking
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </main>
  );
}
