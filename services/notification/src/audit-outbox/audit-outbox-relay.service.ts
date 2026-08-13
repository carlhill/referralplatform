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
 * unpublished `AuditOutbox` rows and forwards each to the real Audit Log
 * Service via `packages/audit-client`, marking it published on success. A
 * row that keeps failing (Audit Log Service down, network partition) is
 * retried on the next tick rather than dropped — `attempts`/`lastError` are
 * recorded for operational visibility, but nothing is ever discarded short
 * of a human decision, since a lost entry here would silently break the
 * platform's non-repudiation guarantee.
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
    // A previous tick may still be in flight (e.g. Audit Log Service is slow
    // to respond) — skip overlapping runs rather than hammering it with
    // concurrent polls of the same rows.
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
        this.logger.warn(`Failed to relay audit outbox row ${row.id} (attempt ${row.attempts + 1}): ${message}`);
        await this.prisma.auditOutbox.update({
          where: { id: row.id },
          data: { attempts: { increment: 1 }, lastError: message.slice(0, 500) },
        });
      }
    }
  }
}
