import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { AuditClient } from '@referralplatform/audit-client';
import type { ActorRef, AuditEventType } from '@referralplatform/shared-types';
import { createAuditClient } from '../common/clients';
import { PrismaService } from '../prisma/prisma.service';

interface OutboxRow {
  id: string;
  type: string;
  actor: unknown;
  subjectType: string;
  subjectId: string;
  payload: unknown;
  occurredAt: Date;
  publishedAt: Date | null;
}

const BATCH_SIZE = 25;

/**
 * The relay half of the outbox pattern — see
 * services/referral/src/audit-outbox/audit-outbox-relay.service.ts and
 * services/consent-security/src/audit-outbox/audit-outbox-relay.service.ts
 * for identical, more fully documented siblings. Every module in this
 * service writes an `AuditOutbox` row in the same DB transaction as its
 * domain write; this relay is the only thing that actually calls the Audit
 * Log Service.
 */
@Injectable()
export class AuditOutboxRelayService {
  private readonly logger = new Logger(AuditOutboxRelayService.name);
  private readonly auditClient: AuditClient;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.auditClient = createAuditClient(config);
  }

  @Interval(5000)
  async relayPending(): Promise<void> {
    const pending: OutboxRow[] = await this.prisma.auditOutbox.findMany({
      where: { publishedAt: null },
      orderBy: { occurredAt: 'asc' },
      take: BATCH_SIZE,
    });

    for (const row of pending) {
      try {
        await this.auditClient.record({
          type: row.type as AuditEventType,
          actor: row.actor as ActorRef,
          subject: { type: row.subjectType, id: row.subjectId },
          payload: row.payload as Record<string, unknown>,
          occurredAt: row.occurredAt.toISOString(),
        });
        await this.prisma.auditOutbox.update({ where: { id: row.id }, data: { publishedAt: new Date() } });
      } catch (err) {
        this.logger.error(
          `Failed to relay audit outbox row ${row.id} (type=${row.type}) — will retry next tick`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }
}
