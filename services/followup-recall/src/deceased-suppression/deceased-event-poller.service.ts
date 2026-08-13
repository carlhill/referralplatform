import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConsentSecurityClient } from '../common/consent-security.client';
import { PrismaService } from '../prisma/prisma.service';
import { DeceasedSuppressionService, SYSTEM_ACTOR } from './deceased-suppression.service';

interface CursorRow {
  id: string;
  lastPolledAt: Date | null;
}

const CURSOR_ID = 'singleton';
/**
 * Overlap window subtracted from "now" when advancing the cursor, to
 * absorb clock skew / eventual-consistency between this service's poll tick
 * and the Consent & Security Service's write — a small amount of
 * re-fetching the same already-processed event is harmless
 * (`DeceasedSuppressionService.suppressAllForPatient` is idempotent); a
 * missed event because the cursor raced ahead of it is not.
 */
const CURSOR_SAFETY_BUFFER_MS = 5000;

/**
 * Polls the Consent & Security Service's `patient.deceased.frozen` feed and
 * reacts IMMEDIATELY (within one poll tick) by suppressing every active
 * Follow-up Plan and every already-scheduled-but-not-yet-sent reminder for
 * that patient — see DeceasedSuppressionService's doc comment for the full
 * suppression logic this delegates to.
 *
 * **On "immediately"**: root CONVENTIONS.md §6 states the intended async
 * transport (SQS/SNS) "is not yet wired into this scaffold," and
 * `BUILD_LOG/consent-security.md`'s "Interim polling pattern" section is
 * explicit that a `GET /events` polling feed is the documented stand-in
 * until it is. A genuinely instantaneous push (a queue subscription or a
 * webhook call from consent-security into this service) is not achievable
 * with that interim transport. This poller runs every
 * a fixed 5-second interval (deliberately much tighter than the 5-minute cadence
 * `ReferralQueueExpiryScheduler`/`TestCompletionDetectionScheduler` use for
 * their own sweeps, because this specific requirement calls out
 * "immediately") — worst case, a reminder that would otherwise have fired
 * gets suppressed within ~5 seconds of the deceased flag being raised, not
 * at its own next scheduled fire time. `ReminderDispatchScheduler`'s own
 * last-mile live check closes the remaining gap for any reminder whose
 * `scheduledFor` falls inside that window. Recommended real fix, out of
 * this task's scope (it requires the queue infrastructure this repo hasn't
 * provisioned yet): subscribe to an SNS/SQS topic consent-security
 * publishes `patient.deceased.frozen` to, for true push-based immediacy.
 */
@Injectable()
export class DeceasedEventPollerService {
  private readonly logger = new Logger(DeceasedEventPollerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consentSecurity: ConsentSecurityClient,
    private readonly suppression: DeceasedSuppressionService,
  ) {}

  @Interval(5000)
  async poll(): Promise<void> {
    try {
      const cursor = await this.getOrCreateCursor();
      const events = await this.consentSecurity.listDeceasedFrozenEventsSince(cursor.lastPolledAt ?? undefined);

      for (const event of events) {
        await this.suppression.suppressAllForPatient(event.patientId, event.payload.flagId, SYSTEM_ACTOR);
      }

      const newCursor = new Date(Date.now() - CURSOR_SAFETY_BUFFER_MS);
      await this.setCursor(newCursor);

      if (events.length > 0) {
        this.logger.log(`Processed ${events.length} patient.deceased.frozen event(s)`);
      }
    } catch (err) {
      this.logger.error(
        'Failed to poll Consent & Security Service for deceased-patient events — will retry next tick',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private async getOrCreateCursor(): Promise<CursorRow> {
    const prisma = this.prisma as unknown as {
      eventPollCursor: {
        findUnique: (args: unknown) => Promise<CursorRow | null>;
        upsert: (args: unknown) => Promise<CursorRow>;
      };
    };
    const existing = await prisma.eventPollCursor.findUnique({ where: { id: CURSOR_ID } });
    if (existing) {
      return existing;
    }
    return prisma.eventPollCursor.upsert({
      where: { id: CURSOR_ID },
      create: { id: CURSOR_ID, lastPolledAt: null },
      update: {},
    });
  }

  private async setCursor(lastPolledAt: Date): Promise<void> {
    const prisma = this.prisma as unknown as {
      eventPollCursor: { upsert: (args: unknown) => Promise<CursorRow> };
    };
    await prisma.eventPollCursor.upsert({
      where: { id: CURSOR_ID },
      create: { id: CURSOR_ID, lastPolledAt },
      update: { lastPolledAt },
    });
  }
}
