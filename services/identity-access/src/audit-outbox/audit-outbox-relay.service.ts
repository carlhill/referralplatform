import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { AuditClient } from '@referralplatform/audit-client';
import { relayPendingAuditEvents } from '@referralplatform/audit-outbox';
import { PrismaService } from '../prisma/prisma.service';
import { createAuditClient } from '../common/clients';

const RELAY_INTERVAL_MS = 5_000;

/**
 * The relay half of the outbox pattern (root CONVENTIONS.md §7).
 *
 * Scheduling and the skip-if-already-running guard live here; the publishing and
 * retry logic lives in `@referralplatform/audit-outbox` so all 11 services share one
 * implementation. They used not to: the same logic was copy-pasted per service and had
 * silently drifted into two different broken retry policies, one of which destroyed
 * audit records during ordinary Audit Log Service restarts. Fix the shared package,
 * not this file.
 */
@Injectable()
export class AuditOutboxRelayService implements OnModuleInit {
  private readonly logger = new Logger(AuditOutboxRelayService.name);
  private readonly auditClient: AuditClient;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.auditClient = createAuditClient(config);
  }

  onModuleInit(): void {
    this.logger.log(`Audit outbox relay starting — polling every ${RELAY_INTERVAL_MS}ms`);
  }

  @Interval(RELAY_INTERVAL_MS)
  async relayPendingEvents(): Promise<void> {
    // A previous tick may still be in flight (e.g. the Audit Log Service is slow to
    // respond) — skip overlapping runs rather than polling the same rows twice.
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await relayPendingAuditEvents({
        prisma: this.prisma,
        auditClient: this.auditClient,
        logger: this.logger,
      });
    } catch (err) {
      this.logger.error(`Audit outbox relay tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
