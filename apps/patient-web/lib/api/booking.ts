import { config } from './config';
import { apiFetch } from './http';
import type { Booking, BookingStatus, CandidateSlot } from './types';

export interface CreateBookingInput {
  referralId: string;
  patientId: string;
  specialistId: string;
  urgentFastPath?: boolean;
  preferredDayOfWeek?: string;
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening';
}

export function createBooking(token: string, input: CreateBookingInput): Promise<Booking> {
  return apiFetch(config.bookingUrl, '/bookings', { method: 'POST', token, body: input });
}

export function listBookings(
  token: string,
  filter: { patientId?: string; referralId?: string; status?: BookingStatus },
): Promise<Booking[]> {
  return apiFetch(config.bookingUrl, '/bookings', { token, query: filter });
}

export function getBooking(token: string, id: string): Promise<Booking> {
  return apiFetch(config.bookingUrl, `/bookings/${id}`, { token });
}

export function candidateSlots(token: string, bookingId: string): Promise<CandidateSlot[]> {
  return apiFetch(config.bookingUrl, `/bookings/${bookingId}/candidate-slots`, { token });
}

export function confirmBooking(token: string, id: string, slotId: string): Promise<Booking> {
  return apiFetch(config.bookingUrl, `/bookings/${id}/confirm`, { method: 'POST', token, body: { slotId } });
}

export function cancelBooking(token: string, id: string, reason?: string): Promise<Booking> {
  return apiFetch(config.bookingUrl, `/bookings/${id}/cancel`, { method: 'POST', token, body: { reason } });
}
