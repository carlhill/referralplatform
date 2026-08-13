/** Row shapes this service's Prisma models produce — the plain-object contract BookingService/SlotsService/WaitlistService code against. */

export interface SlotRecord {
  id: string;
  specialistId: string;
  startsAt: Date;
  endsAt: Date;
  status: string; // open | booked
  version: number;
  bookingId: string | null;
  source: string;
  externalEventId: string | null;
  calendarConnectionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookingRecord {
  id: string;
  referralId: string;
  patientId: string;
  specialistId: string;
  status: string; // preference_captured | waitlisted | confirmed | cancelled | completed
  urgentFastPath: boolean;
  preferredDayOfWeek: string | null;
  preferredTimeOfDay: string | null;
  slotId: string | null;
  confirmedSlotStartsAt: Date | null;
  confirmedSlotEndsAt: Date | null;
  slotVersion: number;
  waitlistedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  externalCalendarEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WaitlistEntryRecord {
  id: string;
  bookingId: string;
  specialistId: string;
  preferredDayOfWeek: string | null;
  preferredTimeOfDay: string | null;
  status: string; // waiting | claimed | expired
  notifiedAt: Date | null;
  claimedAt: Date | null;
  expiredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
