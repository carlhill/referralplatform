import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PublishedEventEntity {
  id: string;
  type: string;
  patientId: string;
  payload: unknown;
  occurredAt: Date;
}

interface PublishedEventTxClient {
  publishedEvent: {
    create: (args: any) => Promise<unknown>;
  };
}

/**
 * Interim, polling-based publish mechanism for cross-service events this
 * service raises (a deceased-patient freeze, in particular) that other
 * services need to react to. Root CONVENTIONS.md §6 names SQS/SNS as the
 * intended real async transport but is explicit that it's "not yet wired
 * into this scaffold" — this table + a `GET /events` endpoint is the
 * documented stand-in until it is: the Follow-up & Recall Service and
 * Referral Service are each expected to poll
 * `GET /events?type=patient.deceased.frozen&since=<ISO timestamp>` and
 * suppress/close accordingly (see BUILD_LOG/consent-security.md). Swapping
 * this for a real queue is additive — publishers keep calling `publish()`,
 * only the transport underneath changes.
 */
@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Called from inside another module's own `$transaction` — same DB, so this participates in that transaction for free. */
  async publishInTx(
    tx: PublishedEventTxClient,
    type: string,
    patientId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await tx.publishedEvent.create({ data: { type, patientId, payload } });
  }

  async listSince(type: string | undefined, since: Date | undefined): Promise<PublishedEventEntity[]> {
    return this.prisma.publishedEvent.findMany({
      where: {
        ...(type ? { type } : {}),
        ...(since ? { occurredAt: { gt: since } } : {}),
      },
      orderBy: { occurredAt: 'asc' },
      take: 500,
    });
  }
}
