import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { GpLinksService } from './gp-links.service';

/**
 * Proactively expires GP links whose 2-day patient-approval window has
 * passed with no response — the "queue expires with no patient response ->
 * GP notified referral lapsed" pattern from minors-multigp-exception-paths.md
 * section 2, applied to link requests. `GpLinksService.checkAuthorisation`
 * also expires lazily on read, so this cron is a proactive sweep, not the
 * only enforcement point — a link never stays silently "pending" forever
 * even if nobody happens to query it.
 *
 * Runs every 5 minutes; interval (not a fixed cron time) because expiry is a
 * relative-to-creation-time deadline, not a wall-clock event.
 */
@Injectable()
export class GpLinkExpiryScheduler {
  private readonly logger = new Logger(GpLinkExpiryScheduler.name);

  constructor(private readonly gpLinks: GpLinksService) {}

  @Interval(5 * 60 * 1000)
  async sweep(): Promise<void> {
    try {
      const count = await this.gpLinks.expireStalePendingLinks();
      if (count > 0) {
        this.logger.log(`Expired ${count} stale pending GP link(s)`);
      }
    } catch (err) {
      this.logger.error('Failed to sweep stale GP links', err instanceof Error ? err.stack : String(err));
    }
  }
}
