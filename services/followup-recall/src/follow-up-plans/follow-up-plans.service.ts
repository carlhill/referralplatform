import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ActorRef, AuditEventType } from '@referralplatform/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { writeOutbox, type OutboxTxClient } from '../audit-outbox/outbox-writer';
import { computeInitialReminderSchedule } from '../reminders/reminder-scheduling';
import { CreateFollowUpPlanDto } from './dto/create-follow-up-plan.dto';
import type { TestCompletionMethod } from './follow-up-plan-status';

export interface FollowUpPlanRecord {
  id: string;
  referralId: string;
  patientId: string;
  gpId: string;
  status: string;
  referralType: string;
  nextReviewDueAt: Date;
  requiredTests: string[];
  indefiniteReferralApplies: boolean;
  testCompletionDetectedVia: string | null;
  testCompletedAt: Date | null;
  gpCourtesyCallDueAt: Date | null;
  gpCourtesyCallCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TxClient extends OutboxTxClient {
  followUpPlan: {
    create: (args: unknown) => Promise<FollowUpPlanRecord>;
    update: (args: unknown) => Promise<FollowUpPlanRecord>;
    findUnique: (args: unknown) => Promise<FollowUpPlanRecord | null>;
  };
  reminder: {
    createMany: (args: unknown) => Promise<unknown>;
    updateMany: (args: unknown) => Promise<unknown>;
  };
  deceasedSuppression?: {
    findUnique: (args: unknown) => Promise<{ patientId: string; active: boolean } | null>;
  };
}

interface RootPrismaClient extends TxClient {
  followUpPlan: TxClient['followUpPlan'] & {
    findMany: (args: unknown) => Promise<FollowUpPlanRecord[]>;
  };
  deceasedSuppression: {
    findUnique: (args: unknown) => Promise<{ patientId: string; active: boolean } | null>;
  };
  $transaction: <T>(fn: (tx: TxClient) => Promise<T>) => Promise<T>;
}

/**
 * Follow-up & Recall Service's core business logic — module #7 of
 * business-process-flow.md / the Follow-up & Recall Service of
 * modules-and-requirements.md.
 *
 * Every plan-lifecycle write (creation, completion) is a clinical/
 * consent-relevant write, so it goes through the outbox pattern (root
 * CONVENTIONS.md §7) in the same DB transaction as the domain write, not a
 * direct `auditClient.record()` call from the request path.
 */
@Injectable()
export class FollowUpPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateFollowUpPlanDto, actor: ActorRef): Promise<FollowUpPlanRecord> {
    const prisma = this.prisma as unknown as RootPrismaClient;

    const suppression = await prisma.deceasedSuppression.findUnique({ where: { patientId: dto.patientId } });
    if (suppression?.active) {
      throw new ConflictException(
        `Patient ${dto.patientId} is flagged deceased — cannot create a new Follow-up Plan`,
      );
    }

    const now = new Date();
    const nextReviewDueAt = new Date(dto.nextReviewDueAt);

    return prisma.$transaction(async (tx: TxClient) => {
      const plan = await tx.followUpPlan.create({
        data: {
          referralId: dto.referralId,
          patientId: dto.patientId,
          gpId: dto.gpId,
          referralType: dto.referralType,
          nextReviewDueAt,
          requiredTests: dto.requiredTests,
          indefiniteReferralApplies: dto.indefiniteReferralApplies ?? false,
          gpCourtesyCallDueAt: new Date(nextReviewDueAt.getTime() - 30 * 24 * 60 * 60 * 1000),
        },
      });

      const schedule = computeInitialReminderSchedule(nextReviewDueAt, now);
      await tx.reminder.createMany({
        data: schedule.map((item) => ({
          followUpPlanId: plan.id,
          patientId: plan.patientId,
          recipientType: item.recipientType,
          channel: item.channel,
          scheduledFor: item.scheduledFor,
          escalationLevel: item.escalationLevel,
        })),
      });

      await writeOutbox(tx, {
        type: 'followup.plan.created',
        actor,
        subjectType: 'FollowUpPlan',
        subjectId: plan.id,
        payload: {
          referralId: dto.referralId,
          referralType: dto.referralType,
          nextReviewDueAt: nextReviewDueAt.toISOString(),
          requiredTests: dto.requiredTests,
          indefiniteReferralApplies: dto.indefiniteReferralApplies ?? false,
          remindersScheduled: schedule.length,
        },
      });

      return plan;
    });
  }

  async findById(id: string): Promise<FollowUpPlanRecord> {
    const plan = await (this.prisma as unknown as RootPrismaClient).followUpPlan.findUnique({ where: { id } });
    if (!plan) {
      throw new NotFoundException(`Follow-up Plan ${id} not found`);
    }
    return plan;
  }

  async listForPatient(patientId: string, status?: string): Promise<FollowUpPlanRecord[]> {
    return (this.prisma as unknown as RootPrismaClient).followUpPlan.findMany({
      where: { patientId, ...(status ? { status } : {}) },
      orderBy: { nextReviewDueAt: 'asc' },
    });
  }

  /** Every still-active plan (test not yet completed, not suppressed/superseded) — used by TestCompletionDetectionScheduler. */
  async listActive(): Promise<FollowUpPlanRecord[]> {
    return (this.prisma as unknown as RootPrismaClient).followUpPlan.findMany({
      where: { status: 'active' },
      orderBy: { nextReviewDueAt: 'asc' },
    });
  }

  /**
   * Marks a plan complete, whether by automatic detection (pathology
   * e-result / My Health Record — see test-completion/) or self-report
   * (SelfReportCompletionDto). Idempotent for an already-completed plan
   * (returns the existing record rather than erroring — a second automatic
   * detection hit after a self-report, or vice versa, is an expected race,
   * not a bug). Refuses to "complete" a plan already suppressed for a
   * deceased patient or superseded by a new referral — those are terminal
   * states this action must not paper over.
   */
  async recordTestCompletion(
    id: string,
    detectedVia: TestCompletionMethod,
    actor: ActorRef,
    payloadExtra: Record<string, unknown> = {},
  ): Promise<FollowUpPlanRecord> {
    const prisma = this.prisma as unknown as RootPrismaClient;
    const existing = await prisma.followUpPlan.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Follow-up Plan ${id} not found`);
    }
    if (existing.status === 'completed') {
      return existing;
    }
    if (existing.status === 'suppressed_deceased' || existing.status === 'superseded_by_new_referral') {
      throw new ConflictException(`Follow-up Plan ${id} is ${existing.status} and cannot be marked completed`);
    }

    const now = new Date();
    return prisma.$transaction(async (tx: TxClient) => {
      const updated = await tx.followUpPlan.update({
        where: { id },
        data: { status: 'completed', testCompletionDetectedVia: detectedVia, testCompletedAt: now },
      });

      // Cancel every reminder still scheduled — the test is done, further
      // pre-due-date or escalating reminders would be noise/confusing.
      await tx.reminder.updateMany({
        where: { followUpPlanId: id, status: 'scheduled' },
        data: { status: 'cancelled' },
      });

      const type: AuditEventType = 'followup.plan.completed';
      await writeOutbox(tx, {
        type,
        actor,
        subjectType: 'FollowUpPlan',
        subjectId: id,
        payload: { detectedVia, ...payloadExtra },
      });

      return updated;
    });
  }
}
