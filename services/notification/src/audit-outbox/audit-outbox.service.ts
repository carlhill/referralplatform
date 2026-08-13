import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditOutboxWriter, EnqueueAuditEventInput } from './audit-outbox.types';

/**
 * Writes an `AuditOutbox` row — see root CONVENTIONS.md §7 ("the outbox
 * pattern is the required pattern" for clinical/consent-relevant writes).
 * Every message-thread lifecycle write in this service (thread created,
 * message posted, participant added, thread resolved) goes through this
 * rather than calling `AuditClient.record()` directly in the request path,
 * so "every write produces a corresponding audit entry" is structurally
 * true (survives a crash between the domain write and the audit write)
 * rather than best-effort. Routine notification delivery (NotificationLog)
 * deliberately does NOT go through this — see prisma/schema.prisma's
 * doc comment on that model.
 */
@Injectable()
export class AuditOutboxService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param writer Pass `this.prisma` for a standalone call, or the `tx`
   *   argument of a `prisma.$transaction(async (tx) => ...)` callback to
   *   enqueue the audit row in the *same* transaction as the domain write it
   *   documents — always prefer the latter for anything that must never be
   *   silently lost.
   */
  async enqueue(writer: AuditOutboxWriter, input: EnqueueAuditEventInput): Promise<void> {
    await writer.auditOutbox.create({
      data: {
        type: input.type,
        actor: input.actor as unknown as Record<string, unknown>,
        subjectType: input.subject.type,
        subjectId: input.subject.id,
        payload: input.payload,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
  }

  /** Convenience overload for call sites outside any transaction. */
  async enqueueStandalone(input: EnqueueAuditEventInput): Promise<void> {
    await this.enqueue(this.prisma, input);
  }
}
