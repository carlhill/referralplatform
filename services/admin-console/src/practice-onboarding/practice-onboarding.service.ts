import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardingAccountClient } from '../common/onboarding-account.client';
import { writeOutbox, type OutboxTxClient } from '../audit-outbox/outbox-writer';
import { isValidTransition, allowedNextStages } from './pipeline-stage';
import { CreatePracticeOnboardingCaseDto } from './dto/create-practice-onboarding-case.dto';
import { AdvanceStageDto } from './dto/advance-stage.dto';
import type { PracticeOnboardingCaseRecord } from './practice-onboarding-case-types';

interface TxClient extends OutboxTxClient {
  practiceOnboardingCase: {
    create: (args: any) => Promise<PracticeOnboardingCaseRecord>;
    update: (args: any) => Promise<PracticeOnboardingCaseRecord>;
  };
}

/**
 * PHN/practice onboarding pipeline — ui-design.md's "Admin/Ops Console"
 * screen 3. See prisma/schema.prisma's PracticeOnboardingCase doc comment:
 * onboarding-account owns the authoritative `GpPractice` record once one
 * exists, but exposes no pipeline-stage-tracking or pre-registration-lead
 * concept — that's what this module owns, linked to the real GpPractice
 * once `gpPracticeId` is set (at the 'registered' transition or later).
 */
@Injectable()
export class PracticeOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly onboardingAccount: OnboardingAccountClient,
  ) {}

  async create(dto: CreatePracticeOnboardingCaseDto, actor: ActorRef): Promise<PracticeOnboardingCaseRecord> {
    return this.prisma.$transaction(async (tx: TxClient) => {
      const record = await tx.practiceOnboardingCase.create({
        data: {
          practiceName: dto.practiceName,
          phn: dto.phn ?? null,
          state: dto.state ?? null,
          contactName: dto.contactName ?? null,
          contactEmail: dto.contactEmail ?? null,
          contactPhone: dto.contactPhone ?? null,
          notes: dto.notes ?? null,
          createdByStaffId: actor.id,
        },
      });
      await writeOutbox(tx, {
        type: 'practice_onboarding_case.opened',
        actor,
        subjectType: 'PracticeOnboardingCase',
        subjectId: record.id,
        payload: { practiceName: record.practiceName, phn: record.phn, state: record.state },
      });
      return record;
    });
  }

  async list(filter: { stage?: string }): Promise<PracticeOnboardingCaseRecord[]> {
    return this.prisma.practiceOnboardingCase.findMany({
      where: { ...(filter.stage ? { stage: filter.stage } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string): Promise<PracticeOnboardingCaseRecord> {
    const record = await this.prisma.practiceOnboardingCase.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException(`PracticeOnboardingCase ${id} not found`);
    }
    return record;
  }

  /**
   * Pulls the current HPI-O verification status / compliance-checklist
   * acknowledgement timestamp from onboarding-account for a case that's
   * already linked to a real `GpPractice` (a no-op — same as
   * VerificationCasesService.refresh() — for a case still at a
   * pre-registration lead stage with no `gpPracticeId`).
   */
  async refresh(id: string): Promise<PracticeOnboardingCaseRecord> {
    const record = await this.getById(id);
    if (!record.gpPracticeId) {
      return record;
    }
    const practice = await this.onboardingAccount.getGpPractice(record.gpPracticeId);
    return this.prisma.practiceOnboardingCase.update({
      where: { id },
      data: {
        lastKnownVerificationStatus: practice.verificationStatus,
        lastKnownComplianceAckAt: practice.complianceChecklistAcknowledgedAt
          ? new Date(practice.complianceChecklistAcknowledgedAt)
          : null,
        integrationTier: practice.integrationTier,
        hpiO: practice.hpiO,
        lastRefreshedAt: new Date(),
      },
    });
  }

  /**
   * Advances (or diverts — `stalled`, `hpio_verification_failed`) the
   * pipeline stage. Rejects a transition not in the allowed graph
   * (pipeline-stage.ts) with a `BadRequestException` naming what actually
   * *is* allowed from here, rather than a bare "invalid stage" — this is a
   * staff-facing tool, the error message doubles as the UI's own guidance.
   */
  async advanceStage(id: string, dto: AdvanceStageDto, actor: ActorRef): Promise<PracticeOnboardingCaseRecord> {
    const record = await this.getById(id);
    if (!isValidTransition(record.stage, dto.toStage)) {
      throw new BadRequestException(
        `Cannot move a PracticeOnboardingCase from '${record.stage}' to '${dto.toStage}'. ` +
          `Allowed next stage(s) from '${record.stage}': ${allowedNextStages(record.stage).join(', ') || '(none — terminal stage)'}.`,
      );
    }

    return this.prisma.$transaction(async (tx: TxClient) => {
      const updated = await tx.practiceOnboardingCase.update({
        where: { id },
        data: {
          stage: dto.toStage,
          gpPracticeId: dto.gpPracticeId ?? record.gpPracticeId,
          integrationTier: dto.integrationTier ?? record.integrationTier,
          notes: dto.notes ?? record.notes,
        },
      });
      await writeOutbox(tx, {
        type: 'practice_onboarding_case.stage_advanced',
        actor,
        subjectType: 'PracticeOnboardingCase',
        subjectId: id,
        payload: { fromStage: record.stage, toStage: dto.toStage, gpPracticeId: updated.gpPracticeId },
      });
      return updated;
    });
  }

  async assign(id: string, staffId: string | null): Promise<PracticeOnboardingCaseRecord> {
    await this.getById(id);
    return this.prisma.practiceOnboardingCase.update({ where: { id }, data: { assignedStaffId: staffId } });
  }
}
