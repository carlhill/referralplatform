import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardingAccountClient } from '../common/onboarding-account.client';
import { writeOutbox, type OutboxTxClient } from '../audit-outbox/outbox-writer';
import { OpenVerificationCaseDto } from './dto/open-verification-case.dto';
import type { VerificationCaseRecord } from './verification-case-types';

interface TxClient extends OutboxTxClient {
  verificationCase: {
    create: (args: unknown) => Promise<VerificationCaseRecord>;
    update: (args: unknown) => Promise<VerificationCaseRecord>;
  };
}

/**
 * AHPRA/WWCC manual verification review queue — ui-design.md's "Admin/Ops
 * Console" screen 1. See prisma/schema.prisma's VerificationCase doc
 * comment for why this console owns this data outright (no other service
 * exposes a "pending manual review" queue, and WWCC has no source-service
 * record at all).
 *
 * Nothing here auto-approves — `approve()`/`reject()` are exclusively
 * staff-decision actions (enforced by the controller's `requireStaff` +
 * `assertStepUp`), mirroring consent-security's AccessRequestsService
 * `decide()` pattern: a case can only be decided once
 * (ConflictException otherwise), and every decision is written through the
 * outbox pattern in the same transaction as the status change.
 */
@Injectable()
export class VerificationCasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly onboardingAccount: OnboardingAccountClient,
  ) {}

  async open(dto: OpenVerificationCaseDto, actor: ActorRef): Promise<VerificationCaseRecord> {
    const created: VerificationCaseRecord = await this.prisma.$transaction(async (tx: TxClient) => {
      const record = await tx.verificationCase.create({
        data: {
          caseType: dto.caseType,
          entityType: dto.entityType ?? null,
          entityId: dto.entityId ?? null,
          subjectName: dto.subjectName,
          subjectIdentifier: dto.subjectIdentifier ?? null,
          issuingState: dto.issuingState ?? null,
          notes: dto.notes ?? null,
          createdByStaffId: actor.id,
        },
      });
      await writeOutbox(tx, {
        type: 'verification_case.opened',
        actor,
        subjectType: 'VerificationCase',
        subjectId: record.id,
        payload: { caseType: record.caseType, subjectName: record.subjectName, entityType: record.entityType, entityId: record.entityId },
      });
      return record;
    });

    // Best-effort initial snapshot — a failed refresh (source service down,
    // or a wwcc case with no source record) never blocks opening the case.
    try {
      return await this.refresh(created.id);
    } catch {
      return created;
    }
  }

  async list(filter: { status?: string; caseType?: string }): Promise<VerificationCaseRecord[]> {
    return this.prisma.verificationCase.findMany({
      where: { ...(filter.status ? { status: filter.status } : {}), ...(filter.caseType ? { caseType: filter.caseType } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string): Promise<VerificationCaseRecord> {
    const record = await this.prisma.verificationCase.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException(`VerificationCase ${id} not found`);
    }
    return record;
  }

  /**
   * Pulls the current automated-verification status from onboarding-account
   * for `ahpra_specialist`/`gp_practice_hpio` cases and snapshots it onto
   * the case (read-only — never itself changes `status`, which is
   * exclusively a staff decision). A no-op for `wwcc` cases (no
   * `entityId`/source-service record to pull from) and for a case with no
   * `entityId` set at all.
   */
  async refresh(id: string): Promise<VerificationCaseRecord> {
    const record = await this.getById(id);
    if (!record.entityId) {
      return record;
    }

    const snapshot = await this.fetchAutomatedSnapshot(record);
    if (!snapshot) {
      return record;
    }

    return this.prisma.verificationCase.update({
      where: { id },
      data: { lastKnownAutomatedStatus: snapshot.status, lastKnownAutomatedDetail: snapshot.detail, lastRefreshedAt: new Date() },
    });
  }

  /** Pulls the live automated-verification snapshot for a case linked to a real onboarding-account entity, or `null` if there's nothing to pull (e.g. a wwcc case). */
  private async fetchAutomatedSnapshot(
    record: VerificationCaseRecord,
  ): Promise<{ status: string; detail: Record<string, unknown> } | null> {
    if (!record.entityId) {
      return null;
    }
    if (record.caseType === 'ahpra_specialist' || record.entityType === 'Specialist') {
      const specialist = await this.onboardingAccount.getSpecialist(record.entityId);
      return {
        status: specialist.ahpraVerificationStatus,
        detail: { ahpraNumber: specialist.ahpraNumber, registrationStatus: specialist.registrationStatus ?? null },
      };
    }
    if (record.caseType === 'gp_practice_hpio' || record.entityType === 'GpPractice') {
      const practice = await this.onboardingAccount.getGpPractice(record.entityId);
      return { status: practice.verificationStatus, detail: { hpiO: practice.hpiO, integrationTier: practice.integrationTier } };
    }
    return null;
  }

  async assign(id: string, staffId: string | null): Promise<VerificationCaseRecord> {
    await this.getById(id);
    return this.prisma.verificationCase.update({ where: { id }, data: { assignedStaffId: staffId } });
  }

  async approve(id: string, actor: ActorRef, decisionNote?: string): Promise<VerificationCaseRecord> {
    return this.decide(id, 'approved', 'verification_case.approved', actor, decisionNote);
  }

  async reject(id: string, actor: ActorRef, decisionNote?: string): Promise<VerificationCaseRecord> {
    return this.decide(id, 'rejected', 'verification_case.rejected', actor, decisionNote);
  }

  async needsInfo(id: string, actor: ActorRef, decisionNote?: string): Promise<VerificationCaseRecord> {
    const record = await this.getById(id);
    if (record.status === 'approved' || record.status === 'rejected') {
      throw new ConflictException(`VerificationCase ${id} has already been decided ('${record.status}')`);
    }
    return this.prisma.$transaction(async (tx: TxClient) => {
      const updated = await tx.verificationCase.update({ where: { id }, data: { status: 'needs_info', notes: decisionNote ?? record.notes } });
      await writeOutbox(tx, {
        type: 'verification_case.needs_info',
        actor,
        subjectType: 'VerificationCase',
        subjectId: id,
        payload: { caseType: record.caseType, note: decisionNote ?? null },
      });
      return updated;
    });
  }

  private async decide(
    id: string,
    status: 'approved' | 'rejected',
    auditType: 'verification_case.approved' | 'verification_case.rejected',
    actor: ActorRef,
    decisionNote?: string,
  ): Promise<VerificationCaseRecord> {
    const record = await this.getById(id);
    if (record.status === 'approved' || record.status === 'rejected') {
      throw new ConflictException(`VerificationCase ${id} has already been decided ('${record.status}')`);
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx: TxClient) => {
      const updated = await tx.verificationCase.update({
        where: { id },
        data: { status, decidedByStaffId: actor.id, decidedAt: now, decisionNote: decisionNote ?? null },
      });
      await writeOutbox(tx, {
        type: auditType,
        actor,
        subjectType: 'VerificationCase',
        subjectId: id,
        payload: {
          caseType: record.caseType,
          entityType: record.entityType,
          entityId: record.entityId,
          subjectIdentifier: record.subjectIdentifier,
          decisionNote: decisionNote ?? null,
        },
      });
      return updated;
    });
  }
}
