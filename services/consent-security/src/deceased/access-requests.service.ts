import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { writeOutbox, type OutboxTxClient } from '../audit-outbox/outbox-writer';
import { DeceasedFlagsService } from './deceased-flags.service';
import { SubmitAccessRequestDto } from './dto/submit-access-request.dto';

export interface AccessRequestEntity {
  id: string;
  deceasedFlagId: string;
  patientId: string;
  requesterName: string;
  requesterEmail: string | null;
  requesterPhone: string | null;
  requesterRelationship: string;
  state: string;
  evidenceDescription: string | null;
  evidenceDocumentId: string | null;
  status: string;
  reviewedByStaffId: string | null;
  reviewedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TxClient extends OutboxTxClient {
  accessRequest: {
    update: (args: any) => Promise<AccessRequestEntity>;
  };
}

/**
 * The human-reviewed executor/administrator/immediate-family/coroner access
 * queue — complaints-continuity-deceased.md section 3 point 3: "Any further
 * access is a human-reviewed request, not self-service ... with identity/
 * authority verified ... before anything is released." Nothing here
 * auto-approves; see state-eligibility.ts for the decision-support-only
 * default-eligibility computation surfaced to reviewing staff.
 */
@Injectable()
export class AccessRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deceasedFlags: DeceasedFlagsService,
  ) {}

  /**
   * A request can only be raised against a patient who is actually flagged
   * deceased (getActiveFlag throws NotFoundException otherwise) — this is
   * what stops the queue from being used as a generic "request my own
   * data" endpoint for a living patient's account.
   *
   * NOTE: deliberately no audit-outbox write here. shared-types'
   * AuditEventType (packages/shared-types/src/audit-event.ts) has
   * 'access.request.granted'/'access.request.denied' but no "raised/
   * submitted" variant, and reusing either of those for a request that
   * hasn't been decided yet would misrepresent the outcome in the signed
   * audit trail — worse than not auditing the submission at all. The
   * request itself is durably recorded in this table (queryable via
   * `GET /deceased-flags/:patientId/access-requests`) and its eventual
   * `approve`/`deny` outcome IS audited below. See
   * BUILD_LOG/consent-security.md for this judgment call and the
   * recommended fix (add 'access.request.raised' to shared-types).
   */
  async submit(patientId: string, dto: SubmitAccessRequestDto): Promise<AccessRequestEntity> {
    const flag = await this.deceasedFlags.getActiveFlag(patientId);
    return this.prisma.accessRequest.create({
      data: {
        deceasedFlagId: flag.id,
        patientId,
        requesterName: dto.requesterName,
        requesterEmail: dto.requesterEmail ?? null,
        requesterPhone: dto.requesterPhone ?? null,
        requesterRelationship: dto.requesterRelationship,
        state: dto.state,
        evidenceDescription: dto.evidenceDescription ?? null,
        evidenceDocumentId: dto.evidenceDocumentId ?? null,
      },
    });
  }

  async getById(id: string): Promise<AccessRequestEntity> {
    const request = await this.prisma.accessRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException(`AccessRequest ${id} not found`);
    }
    return request;
  }

  async listForPatient(patientId: string, status?: string): Promise<AccessRequestEntity[]> {
    return this.prisma.accessRequest.findMany({
      where: { patientId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listPending(): Promise<AccessRequestEntity[]> {
    return this.prisma.accessRequest.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' } });
  }

  async approve(id: string, actor: ActorRef, decisionNote?: string): Promise<AccessRequestEntity> {
    return this.decide(id, 'approved', 'access.request.granted', actor, decisionNote);
  }

  async deny(id: string, actor: ActorRef, decisionNote?: string): Promise<AccessRequestEntity> {
    return this.decide(id, 'denied', 'access.request.denied', actor, decisionNote);
  }

  private async decide(
    id: string,
    status: 'approved' | 'denied',
    auditType: 'access.request.granted' | 'access.request.denied',
    actor: ActorRef,
    decisionNote?: string,
  ): Promise<AccessRequestEntity> {
    const request = await this.getById(id);
    if (request.status !== 'pending') {
      throw new ConflictException(`AccessRequest ${id} has already been decided ('${request.status}')`);
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx: TxClient) => {
      const updated = await tx.accessRequest.update({
        where: { id },
        data: { status, reviewedByStaffId: actor.id, reviewedAt: now, decisionNote: decisionNote ?? null },
      });
      await writeOutbox(tx, {
        type: auditType,
        actor,
        subjectType: 'AccessRequest',
        subjectId: id,
        payload: {
          patientId: request.patientId,
          requesterRelationship: request.requesterRelationship,
          state: request.state,
          decisionNote: decisionNote ?? null,
        },
      });
      return updated;
    });
  }
}
