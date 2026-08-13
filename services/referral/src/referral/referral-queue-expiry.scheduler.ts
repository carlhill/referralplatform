import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ReferralService } from './referral.service';

/**
 * Proactively lapses referrals whose 2-day activation-queue window has
 * passed with no patient response — the "queue expires with no patient
 * response -> GP notified referral lapsed" pattern from
 * business-process-flow.md module 2 / minors-multigp-exception-paths.md
 * section 2. `ReferralService.transition()` also expires lazily on any
 * read/transition attempt, so this cron is a proactive sweep, not the only
 * enforcement point — a referral never stays silently "queued" forever
 * even if nobody happens to touch it, and this is what makes the queue
 * genuinely resumable after a platform outage (see ReferralService's class
 * doc comment).
 *
 * Runs every 5 minutes; interval (not a fixed cron time) because expiry is
 * a relative-to-creation-time deadline, not a wall-clock event — same
 * design as GpLinkExpiryScheduler in services/gp-authorisation.
 */
@Injectable()
export class ReferralQueueExpiryScheduler {
  private readonly logger = new Logger(ReferralQueueExpiryScheduler.name);

  constructor(private readonly referrals: ReferralService) {}

  @Interval(5 * 60 * 1000)
  async sweep(): Promise<void> {
    try {
      const count = await this.referrals.expireStaleQueuedReferrals();
      if (count > 0) {
        this.logger.log(`Lapsed ${count} stale queued referral(s)`);
      }
    } catch (err) {
      this.logger.error('Failed to sweep stale queued referrals', err instanceof Error ? err.stack : String(err));
    }
  }
}
