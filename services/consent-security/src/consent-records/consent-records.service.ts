import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { writeOutbox, type OutboxTxClient } from '../audit-outbox/outbox-writer';
import { CreateConsentRecordDto } from './dto/create-consent-record.dto';
import {
  referralVisibilitySubjectId,
  parseReferralVisibilitySubjectId,
  type ConsentSubjectType,
} from './consent-subject-type';

export interface ConsentRecordEntity {
  id: string;
  patientId: string;
  subjectType: string;
  subjectId: string;
  sensitiveCategory: string | null;
  grantedAt: Date;
  grantedByPrincipalId: string;
  revokedAt: Date | null;
  revokedByPrincipalId: string | null;
  reattestedAt: Date | null;
  nextReattestationDueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TxClient extends OutboxTxClient {
  consentRecord: {
    create: (args: unknown) => Promise<ConsentRecordEntity>;
    update: (args: unknown) => Promise<ConsentRecordEntity>;
  };
}

/**
 * The consent page's core write API — "who can see referrals sent/received,"
 * settable per-referral (not just account-wide), per
 * claude/modules-and-requirements.md's Consent & Security functional
 * requirements. Every grant/revoke is a consent-relevant write, so every one
 * goes through the outbox pattern (root CONVENTIONS.md §7).
 */
@Injectable()
export class ConsentRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async grant(dto: CreateConsentRecordDto, actor: ActorRef): Promise<ConsentRecordEntity> {
    return this.createRecord(dto.patientId, dto.subjectType, dto.subjectId, actor, dto.sensitiveCategory);
  }

  async revoke(id: string, actor: ActorRef): Promise<ConsentRecordEntity> {
    const record = await this.getById(id);
    if (record.revokedAt) {
      throw new ConflictException(`ConsentRecord ${id} is already revoked`);
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx: TxClient) => {
      const updated = await tx.consentRecord.update({
        where: { id },
        data: { revokedAt: now, revokedByPrincipalId: actor.id },
      });
      await writeOutbox(tx, {
        type: 'consent.revoked',
        actor,
        subjectType: 'ConsentRecord',
        subjectId: id,
        payload: {
          patientId: record.patientId,
          consentSubjectType: record.subjectType,
          consentSubjectId: record.subjectId,
        },
      });
      return updated;
    });
  }

  async getById(id: string): Promise<ConsentRecordEntity> {
    const record = await this.prisma.consentRecord.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException(`ConsentRecord ${id} not found`);
    }
    return record;
  }

  async listForPatient(patientId: string, subjectType?: ConsentSubjectType): Promise<ConsentRecordEntity[]> {
    return this.prisma.consentRecord.findMany({
      where: { patientId, ...(subjectType ? { subjectType } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  // --- Per-referral visibility (the "not just account-wide" requirement) ---

  async grantReferralVisibility(
    patientId: string,
    referralId: string,
    granteeId: string,
    actor: ActorRef,
  ): Promise<ConsentRecordEntity> {
    const subjectId = referralVisibilitySubjectId(referralId, granteeId);
    const existing = await this.prisma.consentRecord.findFirst({
      where: { patientId, subjectType: 'referral_visibility', subjectId, revokedAt: null },
    });
    if (existing) {
      return existing; // idempotent
    }
    return this.createRecord(patientId, 'referral_visibility', subjectId, actor);
  }

  async revokeReferralVisibility(
    patientId: string,
    referralId: string,
    granteeId: string,
    actor: ActorRef,
  ): Promise<ConsentRecordEntity> {
    const subjectId = referralVisibilitySubjectId(referralId, granteeId);
    const existing = await this.prisma.consentRecord.findFirst({
      where: { patientId, subjectType: 'referral_visibility', subjectId, revokedAt: null },
    });
    if (!existing) {
      throw new NotFoundException(
        `No active referral-visibility grant for referral=${referralId} grantee=${granteeId}`,
      );
    }
    return this.revoke(existing.id, actor);
  }

  async listReferralVisibility(
    patientId: string,
    referralId: string,
  ): Promise<Array<{ granteeId: string; grantedAt: Date; id: string }>> {
    const records: ConsentRecordEntity[] = await this.prisma.consentRecord.findMany({
      where: { patientId, subjectType: 'referral_visibility', revokedAt: null },
    });
    const parsed: Array<{ id: string; grantedAt: Date; parsed: { referralId: string; granteeId: string } | null }> =
      records.map((r: ConsentRecordEntity) => ({
        id: r.id,
        grantedAt: r.grantedAt,
        parsed: parseReferralVisibilitySubjectId(r.subjectId),
      }));
    return parsed
      .filter(
        (r): r is { id: string; grantedAt: Date; parsed: { referralId: string; granteeId: string } } =>
          r.parsed?.referralId === referralId,
      )
      .map((r) => ({ id: r.id, grantedAt: r.grantedAt, granteeId: r.parsed.granteeId }));
  }

  /** Used cross-service (e.g. by the Referral Service or a specialist portal BFF) to decide whether to show a referral. */
  async checkReferralVisibility(
    patientId: string,
    referralId: string,
    granteeId: string,
  ): Promise<{ visible: boolean }> {
    const subjectId = referralVisibilitySubjectId(referralId, granteeId);
    const record = await this.prisma.consentRecord.findFirst({
      where: { patientId, subjectType: 'referral_visibility', subjectId, revokedAt: null },
    });
    const allGps = await this.prisma.consentRecord.findFirst({
      where: {
        patientId,
        subjectType: 'referral_visibility',
        subjectId: referralVisibilitySubjectId(referralId, 'all_linked_gps'),
        revokedAt: null,
      },
    });
    return { visible: Boolean(record) || Boolean(allGps) };
  }

  private async createRecord(
    patientId: string,
    subjectType: ConsentSubjectType,
    subjectId: string,
    actor: ActorRef,
    sensitiveCategory?: string,
  ): Promise<ConsentRecordEntity> {
    return this.prisma.$transaction(async (tx: TxClient) => {
      const record = await tx.consentRecord.create({
        data: {
          patientId,
          subjectType,
          subjectId,
          sensitiveCategory: sensitiveCategory ?? null,
          grantedByPrincipalId: actor.id,
        },
      });
      await writeOutbox(tx, {
        type: 'consent.granted',
        actor,
        subjectType: 'ConsentRecord',
        subjectId: record.id,
        payload: {
          patientId,
          consentSubjectType: subjectType,
          consentSubjectId: subjectId,
          sensitiveCategory: sensitiveCategory ?? null,
        },
      });
      return record;
    });
  }
}
