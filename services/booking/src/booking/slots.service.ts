import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { SlotRecord } from './types';
import { rankSlotsByPreference, type TimeOfDayBand } from './slot-matching';

const DEFAULT_CANDIDATE_LIMIT = 5;
/** How far ahead to look when ranking — matches CalendarSyncService's own sync window. */
const CANDIDATE_POOL_SIZE = 200;

/**
 * Read-side slot access: lists a specialist's currently-open slots and
 * ranks them against a patient's preference profile
 * (slot-matching.ts). Does NOT perform the concurrency-critical claim
 * itself — that lives in BookingService.confirmSlot, which needs the claim
 * in the same DB transaction as the Booking row update and the audit
 * outbox write. This service is purely the read/ranking side, safely
 * reusable (and independently unit-testable) without touching the
 * write path.
 */
@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

  async listOpen(specialistId: string): Promise<SlotRecord[]> {
    return this.prisma.slot.findMany({
      where: { specialistId, status: 'open' },
      orderBy: { startsAt: 'asc' },
      take: CANDIDATE_POOL_SIZE,
    });
  }

  /**
   * Ranked candidate slots for a booking's preference profile — see
   * slot-matching.ts's `rankSlotsByPreference` for the tiering rules. With
   * no preference given at all (urgent fast-path), this degrades to a
   * flat soonest-first list — business-process-flow.md's "earliest
   * available slot offered directly".
   */
  async rankedCandidates(
    specialistId: string,
    preferredDayOfWeek?: string,
    preferredTimeOfDay?: TimeOfDayBand,
    limit: number = DEFAULT_CANDIDATE_LIMIT,
  ): Promise<SlotRecord[]> {
    const open = await this.listOpen(specialistId);
    return rankSlotsByPreference(open, preferredDayOfWeek, preferredTimeOfDay).slice(0, limit);
  }
}
