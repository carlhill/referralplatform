import type { Booking, BookingStatus } from '@referralplatform/shared-types';
import { apiFetch } from './http';

/**
 * Client for the Booking Service (services/booking, port 3007) — calendar
 * connection management, open-slot visibility, and the booking list. See
 * BUILD_LOG/booking.md.
 */
const BASE_URL = process.env.NEXT_PUBLIC_BOOKING_SERVICE_URL ?? 'http://localhost:3007';

export type CalendarProvider = 'google' | 'outlook' | 'caldav';

export interface CalendarConnection {
  id: string;
  specialistId: string;
  provider: CalendarProvider;
  externalCalendarId: string;
  lastSyncedAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Slot {
  id: string;
  specialistId: string;
  startsAt: string;
  endsAt: string;
  status: 'open' | 'booked';
  bookingId?: string | null;
  version: number;
}

export function listBookings(
  accessToken: string | null,
  filters: { specialistId?: string; patientId?: string; referralId?: string; status?: BookingStatus } = {},
): Promise<Booking[]> {
  return apiFetch<Booking[]>(BASE_URL, '/bookings', { accessToken, query: filters });
}

export function getBooking(accessToken: string | null, id: string): Promise<Booking> {
  return apiFetch<Booking>(BASE_URL, `/bookings/${id}`, { accessToken });
}

export function cancelBooking(accessToken: string | null, id: string, reason?: string): Promise<Booking> {
  return apiFetch<Booking>(BASE_URL, `/bookings/${id}/cancel`, { accessToken, method: 'POST', body: { reason } });
}

export function listOpenSlots(accessToken: string | null, specialistId: string): Promise<Slot[]> {
  return apiFetch<Slot[]>(BASE_URL, `/specialists/${specialistId}/slots`, { accessToken });
}

export function getCalendarConnection(
  accessToken: string | null,
  specialistId: string,
): Promise<CalendarConnection | null> {
  return apiFetch<CalendarConnection | null>(BASE_URL, `/calendar-connections/${specialistId}`, { accessToken });
}

export function connectCalendar(
  accessToken: string | null,
  specialistId: string,
  provider: CalendarProvider,
  externalCalendarId: string,
): Promise<CalendarConnection> {
  return apiFetch<CalendarConnection>(BASE_URL, '/calendar-connections', {
    accessToken,
    method: 'POST',
    body: { specialistId, provider, externalCalendarId },
  });
}

export function syncCalendar(accessToken: string | null, specialistId: string): Promise<unknown> {
  return apiFetch(BASE_URL, `/calendar-connections/${specialistId}/sync`, { accessToken, method: 'POST', body: {} });
}
