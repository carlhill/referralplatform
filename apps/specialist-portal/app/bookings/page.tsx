'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button, Card, CardBody, CardHeader, CardTitle, FormField } from '@referralplatform/ui-components';
import { RequireAuth } from '../components/RequireAuth';
import { StatusPill } from '../components/StatusPill';
import { useAuth } from '../lib/auth/AuthContext';
import {
  connectCalendar,
  getCalendarConnection,
  listBookings,
  listOpenSlots,
  syncCalendar,
  type CalendarConnection,
  type CalendarProvider,
  type Slot,
} from '../lib/api/bookingApi';
import type { Booking } from '@referralplatform/shared-types';

/**
 * Booking Calendar Management — claude/ui-design.md's Specialist portal
 * screen #3: "availability, waitlist, confirmed bookings." Backed by the
 * real Booking Service (services/booking) — see BUILD_LOG/booking.md for
 * the concurrency-safe slot-claim design this reads/writes against.
 */
export default function BookingsPage() {
  return (
    <RequireAuth>
      <BookingsContent />
    </RequireAuth>
  );
}

function BookingsContent() {
  const { accessToken, specialistId } = useAuth();
  const [connection, setConnection] = React.useState<CalendarConnection | null>(null);
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!specialistId) return;
    setError(null);
    try {
      const [conn, openSlots, myBookings] = await Promise.all([
        getCalendarConnection(accessToken, specialistId).catch(() => null),
        listOpenSlots(accessToken, specialistId).catch(() => []),
        listBookings(accessToken, { specialistId }),
      ]);
      setConnection(conn);
      setSlots(openSlots);
      setBookings(myBookings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bookings.');
    }
  }, [accessToken, specialistId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!specialistId) {
    return (
      <main style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--rp-space-5)' }}>
        <p>Set your specialist id (top right) to manage your calendar.</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--rp-space-5)' }}>
      <h1 style={{ fontSize: 'var(--rp-font-size-xl)', marginBottom: 'var(--rp-space-4)' }}>Bookings & calendar</h1>
      {error && <p style={{ color: 'var(--rp-color-urgent-500)' }}>{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Calendar connection</CardTitle>
        </CardHeader>
        <CardBody>
          {connection ? (
            <>
              <p>
                Connected: {connection.provider} ({connection.externalCalendarId})
              </p>
              <p style={{ color: 'var(--rp-color-text-muted)', fontSize: 'var(--rp-font-size-sm)' }}>
                Last synced:{' '}
                {connection.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString('en-AU') : 'never'}
              </p>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await syncCalendar(accessToken, specialistId);
                    await load();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Sync failed.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Sync now
              </Button>
            </>
          ) : (
            <ConnectCalendarForm
              busy={busy}
              onConnect={async (provider, externalCalendarId) => {
                setBusy(true);
                setError(null);
                try {
                  await connectCalendar(accessToken, specialistId, provider, externalCalendarId);
                  await load();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to connect calendar.');
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
          <p
            style={{
              marginTop: 'var(--rp-space-3)',
              fontSize: 'var(--rp-font-size-sm)',
              color: 'var(--rp-color-text-muted)',
            }}
          >
            Calendar sync uses a MOCK provider in this build (see services/booking/src/calendar/mock-calendar.client.ts)
            — simulated realistic AU clinic-hours availability, not a real Google/Outlook/CalDAV connection.
          </p>
        </CardBody>
      </Card>

      <Card style={{ marginTop: 'var(--rp-space-4)' }}>
        <CardHeader>
          <CardTitle>Open slots</CardTitle>
        </CardHeader>
        <CardBody>
          {slots.length === 0 ? (
            <p style={{ color: 'var(--rp-color-text-muted)' }}>No open slots — connect and sync your calendar above.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 'var(--rp-space-4)' }}>
              {slots.slice(0, 20).map((slot) => (
                <li key={slot.id}>
                  {new Date(slot.startsAt).toLocaleString('en-AU')} –{' '}
                  {new Date(slot.endsAt).toLocaleTimeString('en-AU')}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card style={{ marginTop: 'var(--rp-space-4)' }}>
        <CardHeader>
          <CardTitle>Your bookings</CardTitle>
        </CardHeader>
        <CardBody>
          {bookings.length === 0 && <p style={{ color: 'var(--rp-color-text-muted)' }}>No bookings yet.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-2)' }}>
            {bookings.map((booking) => (
              <div
                key={booking.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  border: '1px solid var(--rp-color-border)',
                  borderRadius: 'var(--rp-radius-md)',
                  padding: 'var(--rp-space-2) var(--rp-space-3)',
                }}
              >
                <div>
                  <StatusPill status={booking.status} />
                  <span style={{ marginLeft: 'var(--rp-space-2)' }}>
                    Patient {booking.patientId}
                    {booking.confirmedSlotStartsAt
                      ? ` · ${new Date(booking.confirmedSlotStartsAt).toLocaleString('en-AU')}`
                      : ''}
                  </span>
                </div>
                <Button asChild variant="ghost">
                  <Link href={`/bookings/${booking.id}`}>Manage</Link>
                </Button>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </main>
  );
}

function ConnectCalendarForm({
  busy,
  onConnect,
}: {
  busy: boolean;
  onConnect: (provider: CalendarProvider, externalCalendarId: string) => void;
}) {
  const [provider, setProvider] = React.useState<CalendarProvider>('google');
  const [externalCalendarId, setExternalCalendarId] = React.useState('');

  return (
    <div style={{ display: 'flex', gap: 'var(--rp-space-2)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <FormField id="calendar-provider" label="Provider">
        <select
          id="calendar-provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value as CalendarProvider)}
          style={{
            minHeight: 'var(--rp-touch-target-min)',
            padding: '0 8px',
            border: '1px solid var(--rp-color-border)',
            borderRadius: 'var(--rp-radius-md)',
          }}
        >
          <option value="google">Google Calendar</option>
          <option value="outlook">Outlook</option>
          <option value="caldav">CalDAV</option>
        </select>
      </FormField>
      <FormField id="calendar-id" label="Calendar id / feed URL">
        <input
          id="calendar-id"
          value={externalCalendarId}
          onChange={(e) => setExternalCalendarId(e.target.value)}
          style={{
            minHeight: 'var(--rp-touch-target-min)',
            padding: '0 8px',
            border: '1px solid var(--rp-color-border)',
            borderRadius: 'var(--rp-radius-md)',
          }}
        />
      </FormField>
      <Button
        variant="primary"
        disabled={busy || !externalCalendarId}
        onClick={() => onConnect(provider, externalCalendarId)}
      >
        Connect
      </Button>
    </div>
  );
}
