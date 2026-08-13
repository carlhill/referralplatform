import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentRecordsService } from '../consent-records/consent-records.service';
import { writeOutbox, type OutboxTxClient } from '../audit-outbox/outbox-writer';
import { RaiseConcernDto } from './dto/raise-concern.dto';
import { triageConcern } from './triage';

export interface ConcernEntity {
  id: string;
  patientId: string;
  relatedReferralId: string | null;
  category: string;
  routedTo: string;
  status: string;
  summary: string;
  gpNotifiedId: string | null;
  raisedAt: Date;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TxClient extends OutboxTxClient {
  concern: {
    create: (args: unknown) => Promise<ConcernEntity>;
    update: (args: unknown) => Promise<ConcernEntity>;
  };
}

/**
 * The "raise a concern" entry point — complaints-continuity-deceased.md
 * section 1. Triages *before* it routes (see triage.ts) and logs every
 * concern, regardless of category, to the same signed audit trail as
 * everything else — "this is what makes 'raise a concern' trustworthy
 * rather than a black hole."
 */
@Injectable()
export class ConcernsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consentRecords: ConsentRecordsService,
  ) {}

  async raise(dto: RaiseConcernDto, actor: ActorRef): Promise<ConcernEntity> {
    const { category, routedTo } = triageConcern(dto);

    // "The GP is copied on clinical-care concerns ... with the patient's
    // existing consent settings respected" (complaints-continuity-deceased.md
    // section 1, point 3). Only include gpNotifiedId if there's an active
    // (non-revoked) gp_link consent record for that GP — otherwise silently
    // omit it rather than notifying a GP the patient hasn't consented to.
    let gpNotifiedId: string | null = null;
    if (category === 'clinical_care_or_conduct' && dto.gpNotifiedId) {
      const gpConsents = await this.consentRecords.listForPatient(dto.patientId, 'gp_link');
      const hasActiveConsent = gpConsents.some((c) => c.subjectId === dto.gpNotifiedId && !c.revokedAt);
      gpNotifiedId = hasActiveConsent ? dto.gpNotifiedId : null;
    }

    return this.prisma.$transaction(async (tx: TxClient) => {
      const concern = await tx.concern.create({
        data: {
          patientId: dto.patientId,
          relatedReferralId: dto.relatedReferralId ?? null,
          category,
          routedTo,
          status: 'routed',
          summary: dto.summary,
          gpNotifiedId,
        },
      });
      await writeOutbox(tx, {
        type: 'concern.raised',
        actor,
        subjectType: 'Concern',
        subjectId: concern.id,
        payload: { patientId: dto.patientId, category, routedTo, relatedReferralId: dto.relatedReferralId ?? null },
      });
      return concern;
    });
  }

  async getById(id: string): Promise<ConcernEntity> {
    const concern = await this.prisma.concern.findUnique({ where: { id } });
    if (!concern) {
      throw new NotFoundException(`Concern ${id} not found`);
    }
    return concern;
  }

  async listForPatient(patientId: string, status?: string): Promise<ConcernEntity[]> {
    return this.prisma.concern.findMany({
      where: { patientId, ...(status ? { status } : {}) },
      orderBy: { raisedAt: 'desc' },
    });
  }

  async resolve(id: string, resolutionNote: string, actor: ActorRef): Promise<ConcernEntity> {
    const concern = await this.getById(id);
    if (concern.status === 'resolved') {
      throw new ConflictException(`Concern ${id} is already resolved`);
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx: TxClient) => {
      const updated = await tx.concern.update({
        where: { id },
        data: { status: 'resolved', resolvedAt: now, resolutionNote },
      });
      await writeOutbox(tx, {
        type: 'concern.resolved',
        actor,
        subjectType: 'Concern',
        subjectId: id,
        payload: { patientId: concern.patientId, resolutionNote },
      });
      return updated;
    });
  }

  /**
   * Escalates an unresolved privacy/consent-breach concern to the OAIC —
   * complaints-continuity-deceased.md section 1: "with a path to escalate to
   * the OAIC if it's not resolved internally." shared-types' AuditEventType
   * (packages/shared-types/src/audit-event.ts) has no dedicated
   * "concern.escalated" variant; reusing 'concern.resolved' with
   * `payload.outcome: 'escalated_to_oaic'` is the closest accurate fit
   * without editing a shared package outside this service's scope — see
   * BUILD_LOG/consent-security.md for this judgment call (mirrors the same
   * pattern used for expired GP links in services/gp-authorisation).
   */
  async escalateToOaic(id: string, actor: ActorRef): Promise<ConcernEntity> {
    const concern = await this.getById(id);
    if (concern.category !== 'privacy_or_consent_breach') {
      throw new ConflictException('Only a privacy/consent-breach concern can be escalated to the OAIC');
    }
    if (concern.status === 'resolved' || concern.status === 'escalated_to_oaic') {
      throw new ConflictException(`Concern ${id} is already '${concern.status}'`);
    }
    return this.prisma.$transaction(async (tx: TxClient) => {
      const updated = await tx.concern.update({ where: { id }, data: { status: 'escalated_to_oaic' } });
      await writeOutbox(tx, {
        type: 'concern.resolved',
        actor,
        subjectType: 'Concern',
        subjectId: id,
        payload: { patientId: concern.patientId, outcome: 'escalated_to_oaic' },
      });
      return updated;
    });
  }
}
