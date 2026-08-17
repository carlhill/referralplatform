import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { enqueueAuditEvent } from '@referralplatform/audit-outbox';
import type { AuditOutboxWriter, EnqueueAuditEventInput } from './audit-outbox.types';

/**
 * Enqueues an IAM audit event for durable delivery to the Audit Log Service.
 *
 * Every credential- or identity-security event this service emits (passkey revoked,
 * re-enrolment required, social link created/removed, bootstrap password removed)
 * goes through here rather than calling `AuditClient.record()` in the request path.
 * Root CONVENTIONS.md §7 permits a direct call for "genuinely non-clinical,
 * non-consent events", and these qualify — but that allowance is about *atomicity*
 * (there is no clinical write to stay in one transaction with), not about
 * durability. A direct write that fails is gone, and that is not hypothetical: every
 * `identity.*` event type was missing from the Audit Log Service's whitelist, so
 * every write was rejected with 400 and discarded, and passkey revocations went
 * unrecorded until it was noticed by accident.
 */
@Injectable()
export class AuditOutboxService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param writer `this.prisma` for a standalone call, or the `tx` argument of a
   *   `prisma.$transaction(async (tx) => ...)` callback to enqueue the audit row in
   *   the same transaction as a local domain write.
   */
  async enqueue(writer: AuditOutboxWriter, input: EnqueueAuditEventInput): Promise<void> {
    await enqueueAuditEvent(writer, input);
  }

  /**
   * For call sites with no local transaction — which is most of this service, since
   * its writes land in Keycloak rather than in this database.
   */
  async enqueueStandalone(input: EnqueueAuditEventInput): Promise<void> {
    await this.enqueue(this.prisma, input);
  }
}
