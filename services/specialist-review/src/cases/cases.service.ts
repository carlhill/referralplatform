import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ActorRef, AuditEventType } from '@referralplatform/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { EXTRACTION_PROVIDER, type ExtractionProvider } from '../extraction/extraction-provider.interface';
import { PATHOLOGY_ORDERING_PROVIDER, type PathologyOrderingProvider } from './pathology-ordering.provider';
import { ReferralServiceClient } from '../common/referral-service.client';
import { CreateCaseDto } from './dto/create-case.dto';
import { ExtractDto } from './dto/extract.dto';
import { ConfirmExtractionDto } from './dto/confirm-extraction.dto';
import { RejectExtractionDto } from './dto/reject-extraction.dto';
import { BranchDecisionDto } from './dto/branch-decision.dto';
import { PathologyRequestDto } from './dto/pathology-request.dto';
import { ALLOWED_TRANSITIONS, type CaseStatus } from './case-status';

export interface ReferralCaseRecord {
  id: string;
  referralId: string;
  patientId: string;
  gpId: string;
  specialistId: string | null;
  urgent: boolean;
  referralText: string;
  reasonForReferralHint: string | null;
  status: string;
  receivedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelledReason: string | null;
}

export interface ExtractionResultRecord {
  id: string;
  caseId: string;
  providerName: string;
  structuredData: unknown;
  confidence: number | null;
  status: string;
  extractedAt: Date;
  confirmedAt: Date | null;
  confirmedBySpecialistId: string | null;
  specialistEdits: unknown;
  rejectedAt: Date | null;
  rejectionReason: string | null;
}

export interface SpecialistDecisionRecord {
  id: string;
  caseId: string;
  branch: string;
  adviceText: string | null;
  notes: string | null;
  specialistId: string;
  decidedAt: Date;
  referralServiceSyncStatus: string;
  referralServiceSyncError: string | null;
}

export interface PathologyImagingRequestRecord {
  id: string;
  caseId: string;
  requestType: string;
  testsRequested: string[];
  clinicalNotes: string | null;
  status: string;
  mockProviderReference: string | null;
  requestedBySpecialistId: string;
  requestedAt: Date;
}

interface OutboxRow {
  type: AuditEventType;
  actor: ActorRef;
  subjectType: string;
  subjectId: string;
  payload: Record<string, unknown>;
}

/** The minimal shape this service needs from a Prisma (transaction) client — kept narrow so unit tests can fake it easily. */
interface TxClient {
  referralCase: {
    create: (args: unknown) => Promise<ReferralCaseRecord>;
    update: (args: unknown) => Promise<ReferralCaseRecord>;
    findUnique: (args: unknown) => Promise<ReferralCaseRecord | null>;
    findFirst: (args: unknown) => Promise<ReferralCaseRecord | null>;
    findMany: (args: unknown) => Promise<ReferralCaseRecord[]>;
  };
  extractionResult: {
    create: (args: unknown) => Promise<ExtractionResultRecord>;
    update: (args: unknown) => Promise<ExtractionResultRecord>;
    findUnique: (args: unknown) => Promise<ExtractionResultRecord | null>;
    findFirst: (args: unknown) => Promise<ExtractionResultRecord | null>;
    findMany: (args: unknown) => Promise<ExtractionResultRecord[]>;
  };
  specialistDecision: {
    create: (args: unknown) => Promise<SpecialistDecisionRecord>;
    update: (args: unknown) => Promise<SpecialistDecisionRecord>;
    findFirst: (args: unknown) => Promise<SpecialistDecisionRecord | null>;
    findMany: (args: unknown) => Promise<SpecialistDecisionRecord[]>;
  };
  pathologyImagingRequest: {
    create: (args: unknown) => Promise<PathologyImagingRequestRecord>;
    findMany: (args: unknown) => Promise<PathologyImagingRequestRecord[]>;
  };
  auditOutbox: {
    create: (args: unknown) => Promise<unknown>;
  };
  $transaction: <T>(fn: (tx: TxClient) => Promise<T>) => Promise<T>;
}

/**
 * Specialist Review Service's core business logic — module #10/#5:
 * AI-assisted structured extraction (pluggable ExtractionProvider), the
 * eConsult-vs-full-appointment branch, and pre-visit pathology/imaging
 * requests.
 *
 * **The hard rule this whole service is built around**: extraction output
 * is ALWAYS a review-only summary. `runExtraction()` only ever creates a
 * `pending_review` ExtractionResult — it never changes the case's clinical
 * path, never contacts the Referral Service, never creates a pathology
 * request. Every downstream action (`decideBranch`, `requestPathology`,
 * `completeCase`) is gated on `confirmExtraction()` having been called
 * first for this case (enforced by `requireConfirmedExtraction()` below,
 * not just a UI convention) — this is the direct, structural answer to
 * module #10's "the specialist must explicitly confirm before anything
 * downstream happens" requirement and the Babylon Health cautionary
 * guardrail (see BUILD_LOG/specialist-review.md).
 *
 * Every case-lifecycle write is a clinical/consent-relevant write, so every
 * one writes an AuditOutbox row in the same DB transaction as the domain
 * write (root CONVENTIONS.md §7's outbox pattern).
 */
@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EXTRACTION_PROVIDER) private readonly extractionProvider: ExtractionProvider,
    @Inject(PATHOLOGY_ORDERING_PROVIDER) private readonly pathologyProvider: PathologyOrderingProvider,
    private readonly referralServiceClient: ReferralServiceClient,
  ) {}

  async createCase(dto: CreateCaseDto, actor: ActorRef): Promise<ReferralCaseRecord> {
    const existing = await this.prisma.referralCase.findFirst({ where: { referralId: dto.referralId } });
    if (existing) {
      throw new ConflictException(`A case already exists for referral ${dto.referralId} (case ${existing.id})`);
    }

    return this.prisma.$transaction(async (tx: TxClient) => {
      const referralCase = await tx.referralCase.create({
        data: {
          referralId: dto.referralId,
          patientId: dto.patientId,
          gpId: dto.gpId,
          specialistId: dto.specialistId ?? null,
          urgent: dto.urgent ?? false,
          referralText: dto.referralText,
          reasonForReferralHint: dto.reasonForReferralHint ?? null,
          status: 'received',
        },
      });
      await this.writeOutbox(tx, {
        type: 'referral.routed',
        actor,
        subjectType: 'ReferralCase',
        subjectId: referralCase.id,
        payload: { event: 'specialist_review.case_received', referralId: referralCase.referralId },
      });
      return referralCase;
    });
  }

  async getCase(id: string): Promise<ReferralCaseRecord> {
    const found = await this.prisma.referralCase.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException(`Referral case ${id} not found`);
    }
    return found;
  }

  async listCases(filter: {
    patientId?: string;
    specialistId?: string;
    status?: string;
  }): Promise<ReferralCaseRecord[]> {
    return this.prisma.referralCase.findMany({
      where: {
        ...(filter.patientId ? { patientId: filter.patientId } : {}),
        ...(filter.specialistId ? { specialistId: filter.specialistId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { receivedAt: 'desc' },
    });
  }

  /**
   * Runs the configured ExtractionProvider against the case's referral
   * text. Purely additive: creates a new `pending_review` ExtractionResult
   * and, if this is the case's first extraction, moves case status from
   * `received` to `extracted` — it takes NO other action, per this class's
   * doc comment. Can be re-run (e.g. after correcting garbled source text)
   * any number of times while the case is still `received`/`extracted`.
   */
  async runExtraction(caseId: string, dto: ExtractDto, actor: ActorRef): Promise<ExtractionResultRecord> {
    const referralCase = await this.getCase(caseId);
    if (referralCase.status !== 'received' && referralCase.status !== 'extracted') {
      throw new ConflictException(
        `Referral case ${caseId} is '${referralCase.status}' — extraction can only be (re-)run before it has ` +
          `moved past extraction confirmation. Known limitation, see BUILD_LOG/specialist-review.md.`,
      );
    }

    const output = await this.extractionProvider.extract({
      referralText: dto.referralTextOverride ?? referralCase.referralText,
      reasonForReferralHint: referralCase.reasonForReferralHint ?? undefined,
    });

    return this.prisma.$transaction(async (tx: TxClient) => {
      const result = await tx.extractionResult.create({
        data: {
          caseId,
          providerName: this.extractionProvider.name,
          structuredData: output as unknown as object,
          confidence: output.confidence,
          status: 'pending_review',
        },
      });

      if (referralCase.status === 'received') {
        await tx.referralCase.update({ where: { id: caseId }, data: { status: 'extracted' } });
      }

      await this.writeOutbox(tx, {
        type: 'referral.routed',
        actor,
        subjectType: 'ExtractionResult',
        subjectId: result.id,
        payload: {
          event: 'specialist_review.extraction.run',
          caseId,
          providerName: result.providerName,
          confidence: result.confidence,
          warningCount: output.warnings.length,
        },
      });
      return result;
    });
  }

  async listExtractions(caseId: string): Promise<ExtractionResultRecord[]> {
    await this.getCase(caseId);
    return this.prisma.extractionResult.findMany({ where: { caseId }, orderBy: { extractedAt: 'desc' } });
  }

  /**
   * The explicit-confirmation gate — see class doc comment. Marks this
   * ExtractionResult `confirmed` (recording the specialist's edits, if any,
   * SEPARATELY from the AI's original output), supersedes any other
   * still-pending extraction on the same case, and advances case status to
   * `extraction_confirmed` — the state every downstream action checks for.
   */
  async confirmExtraction(
    caseId: string,
    extractionId: string,
    dto: ConfirmExtractionDto,
    actor: ActorRef,
  ): Promise<ExtractionResultRecord> {
    const referralCase = await this.getCase(caseId);
    const extraction = await this.prisma.extractionResult.findFirst({ where: { id: extractionId, caseId } });
    if (!extraction) {
      throw new NotFoundException(`Extraction ${extractionId} not found on case ${caseId}`);
    }
    if (extraction.status !== 'pending_review') {
      throw new ConflictException(`Extraction ${extractionId} is '${extraction.status}', not pending review`);
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx: TxClient) => {
      const confirmed = await tx.extractionResult.update({
        where: { id: extractionId },
        data: {
          status: 'confirmed',
          confirmedAt: now,
          confirmedBySpecialistId: actor.id,
          specialistEdits: dto.edits ?? null,
        },
      });

      // Supersede any sibling extraction still pending review on this case — only one confirmed extraction per case.
      const siblings = await tx.extractionResult.findMany({ where: { caseId } });
      for (const sibling of siblings) {
        if (sibling.id !== extractionId && sibling.status === 'pending_review') {
          await tx.extractionResult.update({ where: { id: sibling.id }, data: { status: 'superseded' } });
        }
      }

      if (referralCase.status !== 'extraction_confirmed') {
        await this.transitionCase(tx, referralCase, 'extraction_confirmed');
      }

      await this.writeOutbox(tx, {
        type: 'referral.routed',
        actor,
        subjectType: 'ExtractionResult',
        subjectId: extractionId,
        payload: {
          event: 'specialist_review.extraction.confirmed',
          caseId,
          hasSpecialistEdits: !!dto.edits && Object.keys(dto.edits).length > 0,
          note: dto.note ?? null,
        },
      });

      return confirmed;
    });
  }

  async rejectExtraction(
    caseId: string,
    extractionId: string,
    dto: RejectExtractionDto,
    actor: ActorRef,
  ): Promise<ExtractionResultRecord> {
    const extraction = await this.prisma.extractionResult.findFirst({ where: { id: extractionId, caseId } });
    if (!extraction) {
      throw new NotFoundException(`Extraction ${extractionId} not found on case ${caseId}`);
    }
    if (extraction.status !== 'pending_review') {
      throw new ConflictException(`Extraction ${extractionId} is '${extraction.status}', not pending review`);
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx: TxClient) => {
      const rejected = await tx.extractionResult.update({
        where: { id: extractionId },
        data: { status: 'rejected', rejectedAt: now, rejectionReason: dto.reason },
      });
      await this.writeOutbox(tx, {
        type: 'referral.routed',
        actor,
        subjectType: 'ExtractionResult',
        subjectId: extractionId,
        payload: { event: 'specialist_review.extraction.rejected', caseId, reason: dto.reason },
      });
      return rejected;
    });
  }

  /**
   * The eConsult-vs-full-appointment branch decision. Requires a confirmed
   * extraction on this case (`requireConfirmedExtraction`) — the gate this
   * whole service exists to enforce. After committing this service's own
   * record of the decision, makes a best-effort attempt to sync the same
   * decision to the Referral Service's own state machine (see
   * ReferralServiceClient's doc comment for why this is soft-fail and
   * forwards the caller's own token) — a sync failure is recorded on the
   * returned decision but never rolled back or thrown.
   */
  async decideBranch(
    caseId: string,
    dto: BranchDecisionDto,
    actor: ActorRef,
    bearerToken: string,
  ): Promise<SpecialistDecisionRecord> {
    const referralCase = await this.getCase(caseId);
    this.requireStatus(referralCase, 'extraction_confirmed');

    const now = new Date();
    const decision = await this.prisma.$transaction(async (tx: TxClient) => {
      const created = await tx.specialistDecision.create({
        data: {
          caseId,
          branch: dto.branch,
          adviceText: dto.branch === 'econsult' ? dto.adviceText : null,
          notes: dto.notes ?? null,
          specialistId: actor.id,
          decidedAt: now,
        },
      });
      await this.transitionCase(tx, referralCase, dto.branch === 'econsult' ? 'resolved_econsult' : 'full_appointment');
      await this.writeOutbox(tx, {
        type: 'referral.routed',
        actor,
        subjectType: 'SpecialistDecision',
        subjectId: created.id,
        payload: {
          event: 'specialist_review.branch.decided',
          caseId,
          branch: dto.branch,
          referralId: referralCase.referralId,
        },
      });
      return created;
    });

    const sync =
      dto.branch === 'econsult'
        ? await this.syncEconsultToReferralService(referralCase.referralId, bearerToken)
        : await this.referralServiceClient.startReview(referralCase.referralId, bearerToken);

    return this.prisma.specialistDecision.update({
      where: { id: decision.id },
      data: {
        referralServiceSyncStatus: sync.synced ? 'synced' : 'failed',
        referralServiceSyncError: sync.error ?? null,
      },
    });
  }

  private async syncEconsultToReferralService(referralId: string, bearerToken: string) {
    const started = await this.referralServiceClient.startReview(referralId, bearerToken);
    if (!started.synced) return started;
    return this.referralServiceClient.resolveEconsult(referralId, bearerToken);
  }

  async listDecisions(caseId: string): Promise<SpecialistDecisionRecord[]> {
    await this.getCase(caseId);
    return this.prisma.specialistDecision.findMany({ where: { caseId }, orderBy: { decidedAt: 'desc' } });
  }

  /**
   * Pre-visit pathology/imaging request (module 5's "S5"). Requires a
   * confirmed extraction on this case, same gate as `decideBranch` — a
   * specialist can order pre-visit tests as soon as they've reviewed and
   * confirmed the referral content, independent of which branch they later
   * choose. Submits via the (MOCK) PathologyOrderingProvider — see that
   * file's doc comment.
   */
  async requestPathology(
    caseId: string,
    dto: PathologyRequestDto,
    actor: ActorRef,
  ): Promise<PathologyImagingRequestRecord> {
    const referralCase = await this.getCase(caseId);
    if (
      referralCase.status !== 'extraction_confirmed' &&
      referralCase.status !== 'resolved_econsult' &&
      referralCase.status !== 'full_appointment'
    ) {
      throw new ConflictException(
        `Referral case ${caseId} is '${referralCase.status}' — the specialist must confirm the AI-extracted ` +
          `summary before requesting pathology/imaging.`,
      );
    }

    const submission = await this.pathologyProvider.submit({
      caseId,
      requestType: dto.requestType,
      testsRequested: dto.testsRequested,
      clinicalNotes: dto.clinicalNotes,
    });

    return this.prisma.$transaction(async (tx: TxClient) => {
      const request = await tx.pathologyImagingRequest.create({
        data: {
          caseId,
          requestType: dto.requestType,
          testsRequested: dto.testsRequested,
          clinicalNotes: dto.clinicalNotes ?? null,
          status: 'sent',
          mockProviderReference: submission.providerReference,
          requestedBySpecialistId: actor.id,
        },
      });
      await this.writeOutbox(tx, {
        type: 'referral.routed',
        actor,
        subjectType: 'PathologyImagingRequest',
        subjectId: request.id,
        payload: {
          event: 'specialist_review.pathology_request.created',
          caseId,
          requestType: dto.requestType,
          testsRequested: dto.testsRequested,
          providerReference: submission.providerReference,
        },
      });
      return request;
    });
  }

  async listPathologyRequests(caseId: string): Promise<PathologyImagingRequestRecord[]> {
    await this.getCase(caseId);
    return this.prisma.pathologyImagingRequest.findMany({ where: { caseId }, orderBy: { requestedAt: 'desc' } });
  }

  /** Formally closes out the case once the branch has been decided. Best-effort syncs to the Referral Service too. */
  async completeCase(caseId: string, actor: ActorRef, bearerToken: string): Promise<ReferralCaseRecord> {
    const referralCase = await this.getCase(caseId);
    if (referralCase.status !== 'resolved_econsult' && referralCase.status !== 'full_appointment') {
      throw new ConflictException(
        `Referral case ${caseId} is '${referralCase.status}' — a branch decision must be made before completing the case`,
      );
    }
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx: TxClient) => {
      const result = await tx.referralCase.update({
        where: { id: caseId },
        data: { status: 'completed', completedAt: now },
      });
      await this.writeOutbox(tx, {
        type: 'referral.routed',
        actor,
        subjectType: 'ReferralCase',
        subjectId: caseId,
        payload: { event: 'specialist_review.case.completed', referralId: referralCase.referralId },
      });
      return result;
    });

    await this.referralServiceClient.completeReview(referralCase.referralId, bearerToken);
    return updated;
  }

  async cancelCase(caseId: string, reason: string | undefined, actor: ActorRef): Promise<ReferralCaseRecord> {
    const referralCase = await this.getCase(caseId);
    if (!ALLOWED_TRANSITIONS[referralCase.status as CaseStatus]?.includes('cancelled')) {
      throw new ConflictException(`Referral case ${caseId} cannot be cancelled from status '${referralCase.status}'`);
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx: TxClient) => {
      const updated = await tx.referralCase.update({
        where: { id: caseId },
        data: { status: 'cancelled', cancelledAt: now, cancelledReason: reason ?? null },
      });
      await this.writeOutbox(tx, {
        type: 'referral.routed',
        actor,
        subjectType: 'ReferralCase',
        subjectId: caseId,
        payload: {
          event: 'specialist_review.case.cancelled',
          referralId: referralCase.referralId,
          reason: reason ?? null,
        },
      });
      return updated;
    });
  }

  private requireStatus(referralCase: ReferralCaseRecord, expected: CaseStatus): void {
    if (referralCase.status !== expected) {
      throw new ConflictException(
        `Referral case ${referralCase.id} is '${referralCase.status}', expected '${expected}'. The specialist must ` +
          `explicitly confirm the AI-extracted summary (POST .../extractions/:id/confirm) before this action.`,
      );
    }
  }

  private async transitionCase(tx: TxClient, referralCase: ReferralCaseRecord, to: CaseStatus): Promise<void> {
    const from = referralCase.status as CaseStatus;
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw new ConflictException(`Referral case ${referralCase.id} cannot transition from '${from}' to '${to}'`);
    }
    await tx.referralCase.update({ where: { id: referralCase.id }, data: { status: to } });
  }

  private async writeOutbox(tx: TxClient, row: OutboxRow): Promise<void> {
    await tx.auditOutbox.create({
      data: {
        type: row.type,
        actor: row.actor as unknown as object,
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        payload: row.payload as unknown as object,
      },
    });
  }
}
