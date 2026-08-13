import type { ActorRef } from '@referralplatform/shared-types';
import type { BookingRecord, SlotRecord, WaitlistEntryRecord } from '../../src/booking/types';

/**
 * A small hand-rolled fake standing in for PrismaService, shaped exactly
 * like the calls this service's code actually makes — the same pattern
 * services/referral/src/referral/referral.service.spec.ts's `FakePrisma`
 * uses.
 *
 * **Why every method awaits `tick()` before touching its data — this
 * matters for the concurrency test, read carefully:** if every fake method
 * resolved purely synchronously, `Promise.all([...manyClaimAttempts])`
 * would never actually let two calls interleave — a synchronous-bodied
 * `async` function runs to completion before yielding control back to the
 * event loop, so a naive (buggy) "read status, then separately write"
 * implementation would *appear* race-free purely as an artifact of the
 * fake never actually yielding mid-operation, proving nothing. `tick()`
 * (a real event-loop turn via `setImmediate`) makes each individual
 * simulated DB call genuinely yield, so many concurrent callers really do
 * arrive at each operation "at the same time" from the scheduler's point of
 * view — the same way many real concurrent HTTP requests really do open
 * separate DB connections and issue separate round-trips at close to the
 * same wall-clock moment.
 *
 * `slot.updateMany` is the one operation modelled as a *single* atomic
 * step: it awaits `tick()` first (simulating network latency to reach the
 * database), then performs its compare-and-swap (read current status,
 * conditionally write) with no further `await` in between — because that's
 * exactly what a real `UPDATE ... WHERE status = 'open'` statement is: one
 * indivisible operation from every other transaction's point of view
 * (Postgres holds the row lock for the statement's duration). This is what
 * makes the concurrency test in slot-claim.service.spec.ts a genuine test
 * of `SlotClaimService`'s orchestration rather than a tautology — the fake
 * enforces the same atomicity boundary a real Postgres UPDATE provides, no
 * more and no less; if `SlotClaimService` did a separate `findUnique` then
 * `update` instead of one guarded `updateMany`, THIS fake would let two
 * concurrent claims interleave between those two calls and both "succeed",
 * exposing the bug — same as it would against a real database.
 */
function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export class FakePrisma {
  slots = new Map<string, SlotRecord>();
  bookings = new Map<string, BookingRecord>();
  waitlistEntries = new Map<string, WaitlistEntryRecord>();
  calendarConnections = new Map<string, { id: string; specialistId: string; provider: string; externalCalendarId: string; connected: boolean; lastSyncedAt: Date | null; createdAt: Date; updatedAt: Date }>();
  outbox: Array<{ type: string; actor: ActorRef; subjectType: string; subjectId: string; payload: Record<string, unknown> }> = [];
  private counter = 0;

  slot = {
    create: async ({ data }: { data: Partial<SlotRecord> }) => {
      await tick();
      const id = data.id ?? `slot-${++this.counter}`;
      const now = new Date();
      const record: SlotRecord = {
        id,
        specialistId: data.specialistId!,
        startsAt: data.startsAt!,
        endsAt: data.endsAt!,
        status: data.status ?? 'open',
        version: data.version ?? 0,
        bookingId: data.bookingId ?? null,
        source: data.source ?? 'calendar_sync',
        externalEventId: data.externalEventId ?? null,
        calendarConnectionId: data.calendarConnectionId ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.slots.set(id, record);
      return record;
    },
    findUnique: async ({ where }: { where: { id?: string; specialistId_startsAt?: { specialistId: string; startsAt: Date } } }) => {
      await tick();
      if (where.id) return this.slots.get(where.id) ?? null;
      if (where.specialistId_startsAt) {
        const { specialistId, startsAt } = where.specialistId_startsAt;
        return (
          [...this.slots.values()].find((s) => s.specialistId === specialistId && s.startsAt.getTime() === startsAt.getTime()) ?? null
        );
      }
      return null;
    },
    findMany: async ({ where }: { where: { specialistId?: string; status?: string } }) => {
      await tick();
      return [...this.slots.values()]
        .filter((s) => (where.specialistId ? s.specialistId === where.specialistId : true) && (where.status ? s.status === where.status : true))
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      await tick();
      const existing = this.slots.get(where.id);
      if (!existing) throw new Error('slot not found');
      const updated: SlotRecord = {
        ...existing,
        ...applyIncrement(existing as unknown as Record<string, unknown>, data),
        updatedAt: new Date(),
      } as SlotRecord;
      this.slots.set(where.id, updated);
      return updated;
    },
    /**
     * THE atomic compare-and-swap — see class doc comment. One `tick()`
     * (simulated network latency), then a synchronous read-compare-write
     * with no further yield point, mirroring a real `UPDATE ... WHERE`
     * statement's atomicity.
     */
    updateMany: async ({ where, data }: { where: { id: string; status: string }; data: Record<string, unknown> }) => {
      await tick();
      const existing = this.slots.get(where.id);
      if (!existing || existing.status !== where.status) {
        return { count: 0 };
      }
      const updated: SlotRecord = {
        ...existing,
        ...applyIncrement(existing as unknown as Record<string, unknown>, data),
        updatedAt: new Date(),
      } as SlotRecord;
      this.slots.set(where.id, updated);
      return { count: 1 };
    },
  };

  booking = {
    create: async ({ data }: { data: Partial<BookingRecord> }) => {
      await tick();
      const id = `booking-${++this.counter}`;
      const now = new Date();
      const record: BookingRecord = {
        id,
        referralId: data.referralId!,
        patientId: data.patientId!,
        specialistId: data.specialistId!,
        status: data.status ?? 'preference_captured',
        urgentFastPath: data.urgentFastPath ?? false,
        preferredDayOfWeek: data.preferredDayOfWeek ?? null,
        preferredTimeOfDay: data.preferredTimeOfDay ?? null,
        slotId: null,
        confirmedSlotStartsAt: null,
        confirmedSlotEndsAt: null,
        slotVersion: 0,
        waitlistedAt: null,
        cancelledAt: null,
        cancellationReason: null,
        externalCalendarEventId: null,
        createdAt: now,
        updatedAt: now,
      };
      this.bookings.set(id, record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      await tick();
      const existing = this.bookings.get(where.id);
      if (!existing) throw new Error('booking not found');
      const updated = { ...existing, ...data, updatedAt: new Date() } as BookingRecord;
      this.bookings.set(where.id, updated);
      return updated;
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      await tick();
      return this.bookings.get(where.id) ?? null;
    },
    findMany: async ({ where }: { where: Record<string, unknown> }) => {
      await tick();
      return [...this.bookings.values()].filter((b) => Object.entries(where).every(([k, v]) => (b as any)[k] === v));
    },
  };

  waitlistEntry = {
    create: async ({ data }: { data: Partial<WaitlistEntryRecord> }) => {
      await tick();
      const id = `waitlist-${++this.counter}`;
      const now = new Date();
      const record: WaitlistEntryRecord = {
        id,
        bookingId: data.bookingId!,
        specialistId: data.specialistId!,
        preferredDayOfWeek: data.preferredDayOfWeek ?? null,
        preferredTimeOfDay: data.preferredTimeOfDay ?? null,
        status: data.status ?? 'waiting',
        notifiedAt: null,
        claimedAt: null,
        expiredAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.waitlistEntries.set(id, record);
      return record;
    },
    findUnique: async ({ where }: { where: { id?: string; bookingId?: string } }) => {
      await tick();
      if (where.id) return this.waitlistEntries.get(where.id) ?? null;
      if (where.bookingId) return [...this.waitlistEntries.values()].find((w) => w.bookingId === where.bookingId) ?? null;
      return null;
    },
    findMany: async ({ where }: { where: { specialistId?: string; status?: string } }) => {
      await tick();
      return [...this.waitlistEntries.values()]
        .filter((w) => (where.specialistId ? w.specialistId === where.specialistId : true) && (where.status ? w.status === where.status : true))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      await tick();
      const existing = this.waitlistEntries.get(where.id);
      if (!existing) throw new Error('waitlist entry not found');
      const updated = { ...existing, ...data, updatedAt: new Date() } as WaitlistEntryRecord;
      this.waitlistEntries.set(where.id, updated);
      return updated;
    },
  };

  calendarConnection = {
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { specialistId: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => {
      await tick();
      const existing = [...this.calendarConnections.values()].find((c) => c.specialistId === where.specialistId);
      const now = new Date();
      if (existing) {
        const updated = { ...existing, ...update, updatedAt: now };
        this.calendarConnections.set(existing.id, updated);
        return updated;
      }
      const id = `conn-${++this.counter}`;
      const record = {
        id,
        specialistId: where.specialistId,
        provider: (create as any).provider,
        externalCalendarId: (create as any).externalCalendarId,
        connected: true,
        lastSyncedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.calendarConnections.set(id, record);
      return record;
    },
    findUnique: async ({ where }: { where: { id?: string; specialistId?: string } }) => {
      await tick();
      if (where.id) return this.calendarConnections.get(where.id) ?? null;
      if (where.specialistId) return [...this.calendarConnections.values()].find((c) => c.specialistId === where.specialistId) ?? null;
      return null;
    },
    findMany: async ({ where }: { where: { connected?: boolean } }) => {
      await tick();
      return [...this.calendarConnections.values()].filter((c) => (where.connected !== undefined ? c.connected === where.connected : true));
    },
    update: async ({ where, data }: { where: { specialistId: string }; data: Record<string, unknown> }) => {
      await tick();
      const existing = [...this.calendarConnections.values()].find((c) => c.specialistId === where.specialistId);
      if (!existing) throw new Error('calendar connection not found');
      const updated = { ...existing, ...data, updatedAt: new Date() };
      this.calendarConnections.set(existing.id, updated);
      return updated;
    },
  };

  auditOutbox = {
    create: async ({
      data,
    }: {
      data: { type: string; actor: ActorRef; subjectType: string; subjectId: string; payload: Record<string, unknown> };
    }) => {
      await tick();
      this.outbox.push(data);
      return data;
    },
  };

  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

/** Handles Prisma's `{ increment: n }` update-input shorthand for numeric fields (used for `Slot.version`). */
function applyIncrement(existing: Record<string, unknown>, data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...data };
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in (value as any)) {
      result[key] = (existing[key] as number) + (value as any).increment;
    }
  }
  return result;
}
