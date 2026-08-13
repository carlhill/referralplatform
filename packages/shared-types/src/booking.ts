import { BookingId, ISODateTimeString, PatientId, ReferralId, SpecialistId } from './common';

export type BookingStatus = 'preference_captured' | 'waitlisted' | 'confirmed' | 'cancelled' | 'completed';

/**
 * Concurrent booking attempts on the same slot must be handled with real
 * database-level locking or optimistic concurrency control — see
 * modules-and-requirements.md, Booking Service functional requirements.
 * The `slotVersion` field exists to support optimistic concurrency at the
 * persistence layer (increment-and-compare on write).
 */
export interface Booking {
  id: BookingId;
  referralId: ReferralId;
  patientId: PatientId;
  specialistId: SpecialistId;
  status: BookingStatus;
  /** Bypasses preference negotiation when the referral's urgent flag is set. */
  urgentFastPath: boolean;
  preferredDayOfWeek?: string;
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening';
  confirmedSlotStartsAt?: ISODateTimeString;
  confirmedSlotEndsAt?: ISODateTimeString;
  /** Optimistic-concurrency token for the underlying calendar slot. */
  slotVersion: number;
  waitlistedAt?: ISODateTimeString;
  cancelledAt?: ISODateTimeString;
  cancellationReason?: string;
  /** Two-way calendar sync reference (Google/Outlook/CalDAV event id). */
  externalCalendarEventId?: string;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}
