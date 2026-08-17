import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { AuditClient } from '@referralplatform/audit-client';
import type { ActorRef, AuditEventType } from '@referralplatform/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { createAuditClient } from '../common/clients';

const RELAY_INTERVAL_MS = 5_000;
const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 8;

/**
 * The relay half of the outbox pattern (root CONVENTIONS.md §7): polls for
 * unpublished `AuditOutbox` rows and forwards each to the Audit Log Service,
 * marking it published on success. A row that keeps failing is retried on the next
 * tick rather than dropped, with `attempts`/`lastError` recorded for diagnosis.
 *
 * Mirrors the relay in `onboarding-account` deliberately — one behaviour to reason
 * about across services — with one addition: a row that exhausts MAX_ATTEMPTS is
 * logged as stranded. In the other services a capped row is simply skipped by the
 * query forever, with nothing surfacing that audit entries are stuck; that cost real
 * time to diagnose on 2026-08-17, when rows capped out during an unrelated outage
 * and stayed invisible until someone queried the table by hand. See TODO 1a — the
 * proper fix (a metric plus an admin requeue path) is still open platform-wide.
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
    // A previous tick may still be in flight; skip overlapping runs rather than
    // polling the same rows concurrently.
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.relayOnce();
    } catch (err) {
      this.logger.error(`Audit outbox relay tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async relayOnce(): Promise<void> {
    const pending = await this.prisma.auditOutbox.findMany({
      where: { publishedAt: null, attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { occurredAt: 'asc' },
      take: BATCH_SIZE,
    });

    for (const row of pending) {
      try {
        await this.auditClient.record({
          type: row.type as AuditEventType,
          actor: row.actor as unknown as ActorRef,
          subject: { type: row.subjectType, id: row.subjectId },
          payload: row.payload as Record<string, unknown>,
          occurredAt: row.occurredAt.toISOString(),
        });
        await this.prisma.auditOutbox.update({
          where: { id: row.id },
          data: { publishedAt: new Date() },
        });
      } catch (err) {
        const message = (err as Error).message ?? 'unknown error';
        const attempts = row.attempts + 1;
        await this.prisma.auditOutbox.update({
          where: { id: row.id },
          data: { attempts: { increment: 1 }, lastError: message.slice(0, 500) },
        });

        if (attempts >= MAX_ATTEMPTS) {
          // Loud, because from here the row is invisible to the poll query above and
          // will never be retried without manual intervention.
          this.logger.error(
            `Audit outbox row ${row.id} (${row.type}) STRANDED after ${attempts} attempts and will no longer be retried: ${message}`,
          );
        } else {
          this.logger.warn(`Failed to relay audit outbox row ${row.id} (attempt ${attempts}): ${message}`);
        }
      }
    }
  }
}
