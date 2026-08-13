import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import {
  CasesService,
  type ReferralCaseRecord,
  type ExtractionResultRecord,
  type SpecialistDecisionRecord,
  type PathologyImagingRequestRecord,
} from './cases.service';
import type { ExtractionOutput, ExtractionProvider } from '../extraction/extraction-provider.interface';
import type { PathologyOrderingProvider } from './pathology-ordering.provider';
import type { ReferralServiceClient } from '../common/referral-service.client';

/**
 * A small hand-rolled fake standing in for PrismaService, shaped exactly
 * like the calls CasesService actually makes — same pattern
 * services/referral/src/referral/referral.service.spec.ts uses.
 */
class FakePrisma {
  cases = new Map<string, ReferralCaseRecord>();
  extractions = new Map<string, ExtractionResultRecord>();
  decisions = new Map<string, SpecialistDecisionRecord>();
  pathologyRequests = new Map<string, PathologyImagingRequestRecord>();
  outbox: Array<{
    type: string;
    actor: ActorRef;
    subjectType: string;
    subjectId: string;
    payload: Record<string, unknown>;
  }> = [];
  private counter = 0;

  referralCase = {
    create: async ({ data }: { data: Partial<ReferralCaseRecord> }) => {
      const id = `case-${++this.counter}`;
      const now = new Date();
      const record: ReferralCaseRecord = {
        id,
        referralId: data.referralId!,
        patientId: data.patientId!,
        gpId: data.gpId!,
        specialistId: data.specialistId ?? null,
        urgent: data.urgent ?? false,
        referralText: data.referralText!,
        reasonForReferralHint: data.reasonForReferralHint ?? null,
        status: data.status ?? 'received',
        receivedAt: now,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        cancelledAt: null,
        cancelledReason: null,
      };
      this.cases.set(id, record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<ReferralCaseRecord> }) => {
      const existing = this.cases.get(where.id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data, updatedAt: new Date() } as ReferralCaseRecord;
      this.cases.set(where.id, updated);
      return updated;
    },
    findUnique: async ({ where }: { where: { id: string } }) => this.cases.get(where.id) ?? null,
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      [...this.cases.values()].find((c) => Object.entries(where).every(([k, v]) => (c as any)[k] === v)) ?? null,
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      [...this.cases.values()].filter((c) => {
        if (where.patientId && c.patientId !== where.patientId) return false;
        if (where.specialistId && c.specialistId !== where.specialistId) return false;
        if (where.status && c.status !== where.status) return false;
        return true;
      }),
  };

  extractionResult = {
    create: async ({ data }: { data: Partial<ExtractionResultRecord> }) => {
      const id = `extraction-${++this.counter}`;
      const now = new Date();
      const record: ExtractionResultRecord = {
        id,
        caseId: data.caseId!,
        providerName: data.providerName!,
        structuredData: data.structuredData!,
        confidence: data.confidence ?? null,
        status: data.status ?? 'pending_review',
        extractedAt: now,
        confirmedAt: null,
        confirmedBySpecialistId: null,
        specialistEdits: null,
        rejectedAt: null,
        rejectionReason: null,
      };
      this.extractions.set(id, record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<ExtractionResultRecord> }) => {
      const existing = this.extractions.get(where.id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data } as ExtractionResultRecord;
      this.extractions.set(where.id, updated);
      return updated;
    },
    findUnique: async ({ where }: { where: { id: string } }) => this.extractions.get(where.id) ?? null,
    findFirst: async ({ where }: { where: { id?: string; caseId?: string } }) =>
      [...this.extractions.values()].find(
        (e) => (where.id ? e.id === where.id : true) && (where.caseId ? e.caseId === where.caseId : true),
      ) ?? null,
    findMany: async ({ where }: { where: { caseId?: string } }) =>
      [...this.extractions.values()].filter((e) => (where.caseId ? e.caseId === where.caseId : true)),
  };

  specialistDecision = {
    create: async ({ data }: { data: Partial<SpecialistDecisionRecord> }) => {
      const id = `decision-${++this.counter}`;
      const record: SpecialistDecisionRecord = {
        id,
        caseId: data.caseId!,
        branch: data.branch!,
        adviceText: data.adviceText ?? null,
        notes: data.notes ?? null,
        specialistId: data.specialistId!,
        decidedAt: data.decidedAt ?? new Date(),
        referralServiceSyncStatus: 'pending',
        referralServiceSyncError: null,
      };
      this.decisions.set(id, record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<SpecialistDecisionRecord> }) => {
      const existing = this.decisions.get(where.id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data } as SpecialistDecisionRecord;
      this.decisions.set(where.id, updated);
      return updated;
    },
    findFirst: async ({ where }: { where: { caseId?: string } }) =>
      [...this.decisions.values()].find((d) => (where.caseId ? d.caseId === where.caseId : true)) ?? null,
    findMany: async ({ where }: { where: { caseId?: string } }) =>
      [...this.decisions.values()].filter((d) => (where.caseId ? d.caseId === where.caseId : true)),
  };

  pathologyImagingRequest = {
    create: async ({ data }: { data: Partial<PathologyImagingRequestRecord> }) => {
      const id = `pathology-${++this.counter}`;
      const record: PathologyImagingRequestRecord = {
        id,
        caseId: data.caseId!,
        requestType: data.requestType!,
        testsRequested: data.testsRequested!,
        clinicalNotes: data.clinicalNotes ?? null,
        status: data.status ?? 'sent',
        mockProviderReference: data.mockProviderReference ?? null,
        requestedBySpecialistId: data.requestedBySpecialistId!,
        requestedAt: new Date(),
      };
      this.pathologyRequests.set(id, record);
      return record;
    },
    findMany: async ({ where }: { where: { caseId?: string } }) =>
      [...this.pathologyRequests.values()].filter((p) => (where.caseId ? p.caseId === where.caseId : true)),
  };

  auditOutbox = {
    create: async ({ data }: { data: any }) => {
      this.outbox.push(data);
      return data;
    },
  };

  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

const fakeExtractionOutput: ExtractionOutput = {
  patient: { name: 'Jane Doe' },
  reasonForReferral: 'Query thyroid nodule',
  keyHistory: ['Nil relevant'],
  medications: [],
  referringGp: { name: 'Dr Test' },
  urgencyIndicators: [],
  confidence: 0.8,
  warnings: [],
};

const specialistActor: ActorRef = { principalType: 'specialist', id: 'spec-1' };
const systemActor: ActorRef = { principalType: 'system', id: 'referral-service' };

function baseCaseDto(overrides: Record<string, unknown> = {}) {
  return {
    referralId: 'ref-1',
    patientId: 'pat-1',
    gpId: 'gp-1',
    referralText: 'Re: Jane Doe\nReason for referral:\nQuery thyroid nodule\n',
    ...overrides,
  } as any;
}

describe('CasesService', () => {
  let prisma: FakePrisma;
  let extractionProvider: { name: string; extract: jest.Mock };
  let pathologyProvider: { name: string; submit: jest.Mock };
  let referralServiceClient: {
    startReview: jest.Mock;
    resolveEconsult: jest.Mock;
    completeReview: jest.Mock;
  };
  let service: CasesService;

  beforeEach(() => {
    prisma = new FakePrisma();
    extractionProvider = { name: 'rule-based-v1', extract: jest.fn().mockResolvedValue(fakeExtractionOutput) };
    pathologyProvider = {
      name: 'mock-e-ordering-v1',
      submit: jest.fn().mockResolvedValue({ providerReference: 'MOCK-1' }),
    };
    referralServiceClient = {
      startReview: jest.fn().mockResolvedValue({ synced: true }),
      resolveEconsult: jest.fn().mockResolvedValue({ synced: true }),
      completeReview: jest.fn().mockResolvedValue({ synced: true }),
    };
    service = new CasesService(
      prisma as any,
      extractionProvider as unknown as ExtractionProvider,
      pathologyProvider as unknown as PathologyOrderingProvider,
      referralServiceClient as unknown as ReferralServiceClient,
    );
  });

  describe('createCase', () => {
    it('creates a case in "received" status and audits it', async () => {
      const created = await service.createCase(baseCaseDto(), systemActor);
      expect(created.status).toBe('received');
      expect(prisma.outbox.some((e) => (e.payload as any).event === 'specialist_review.case_received')).toBe(true);
    });

    it('rejects a duplicate referralId', async () => {
      await service.createCase(baseCaseDto(), systemActor);
      await expect(service.createCase(baseCaseDto(), systemActor)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('runExtraction', () => {
    it('creates a pending_review extraction and moves the case to "extracted"', async () => {
      const created = await service.createCase(baseCaseDto(), systemActor);
      const extraction = await service.runExtraction(created.id, {}, specialistActor);
      expect(extraction.status).toBe('pending_review');
      expect(extraction.providerName).toBe('rule-based-v1');
      expect((await service.getCase(created.id)).status).toBe('extracted');
    });

    it('never auto-actions anything — no decision or pathology request is created by extraction alone', async () => {
      const created = await service.createCase(baseCaseDto(), systemActor);
      await service.runExtraction(created.id, {}, specialistActor);
      expect(await service.listDecisions(created.id)).toHaveLength(0);
      expect(await service.listPathologyRequests(created.id)).toHaveLength(0);
    });

    it('can be re-run while still received/extracted', async () => {
      const created = await service.createCase(baseCaseDto(), systemActor);
      await service.runExtraction(created.id, {}, specialistActor);
      await service.runExtraction(created.id, {}, specialistActor);
      expect(await service.listExtractions(created.id)).toHaveLength(2);
    });

    it('throws NotFoundException for an unknown case', async () => {
      await expect(service.runExtraction('nope', {}, specialistActor)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('the explicit-confirmation gate', () => {
    it('blocks decideBranch until an extraction has been confirmed', async () => {
      const created = await service.createCase(baseCaseDto(), systemActor);
      await service.runExtraction(created.id, {}, specialistActor);
      await expect(
        service.decideBranch(created.id, { branch: 'econsult', adviceText: 'Advice' }, specialistActor, 'tok'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('blocks requestPathology until an extraction has been confirmed', async () => {
      const created = await service.createCase(baseCaseDto(), systemActor);
      await service.runExtraction(created.id, {}, specialistActor);
      await expect(
        service.requestPathology(created.id, { requestType: 'pathology', testsRequested: ['FBC'] }, specialistActor),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('confirming an extraction advances the case to extraction_confirmed and supersedes siblings', async () => {
      const created = await service.createCase(baseCaseDto(), systemActor);
      const first = await service.runExtraction(created.id, {}, specialistActor);
      const second = await service.runExtraction(created.id, {}, specialistActor);

      const confirmed = await service.confirmExtraction(
        created.id,
        second.id,
        { confirmed: true, edits: { patient: { name: 'Corrected Name' } } },
        specialistActor,
      );
      expect(confirmed.status).toBe('confirmed');
      expect(confirmed.confirmedBySpecialistId).toBe('spec-1');
      expect(confirmed.specialistEdits).toEqual({ patient: { name: 'Corrected Name' } });

      const firstAfter = (await service.listExtractions(created.id)).find((e) => e.id === first.id)!;
      expect(firstAfter.status).toBe('superseded');
      expect((await service.getCase(created.id)).status).toBe('extraction_confirmed');
    });

    it('rejects confirming an extraction that is not pending_review', async () => {
      const created = await service.createCase(baseCaseDto(), systemActor);
      const extraction = await service.runExtraction(created.id, {}, specialistActor);
      await service.confirmExtraction(created.id, extraction.id, { confirmed: true }, specialistActor);
      await expect(
        service.confirmExtraction(created.id, extraction.id, { confirmed: true }, specialistActor),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('decideBranch', () => {
    async function confirmedCase() {
      const created = await service.createCase(baseCaseDto(), systemActor);
      const extraction = await service.runExtraction(created.id, {}, specialistActor);
      await service.confirmExtraction(created.id, extraction.id, { confirmed: true }, specialistActor);
      return created;
    }

    it('records an econsult decision, moves the case to resolved_econsult, and syncs to the Referral Service', async () => {
      const created = await confirmedCase();
      const decision = await service.decideBranch(
        created.id,
        { branch: 'econsult', adviceText: 'Reassure and review in 3 months' },
        specialistActor,
        'tok-123',
      );
      expect(decision.branch).toBe('econsult');
      expect(decision.referralServiceSyncStatus).toBe('synced');
      expect(referralServiceClient.startReview).toHaveBeenCalledWith('ref-1', 'tok-123');
      expect(referralServiceClient.resolveEconsult).toHaveBeenCalledWith('ref-1', 'tok-123');
      expect((await service.getCase(created.id)).status).toBe('resolved_econsult');
    });

    it('records a full_appointment decision and moves the case to full_appointment', async () => {
      const created = await confirmedCase();
      const decision = await service.decideBranch(created.id, { branch: 'full_appointment' }, specialistActor, 'tok');
      expect(decision.branch).toBe('full_appointment');
      expect((await service.getCase(created.id)).status).toBe('full_appointment');
    });

    it('records a failed sync without throwing or blocking the decision', async () => {
      referralServiceClient.startReview.mockResolvedValue({ synced: false, error: 'Referral Service unreachable' });
      const created = await confirmedCase();
      const decision = await service.decideBranch(created.id, { branch: 'full_appointment' }, specialistActor, 'tok');
      expect(decision.referralServiceSyncStatus).toBe('failed');
      expect(decision.referralServiceSyncError).toBe('Referral Service unreachable');
      // The case's own status still advanced, even though the sync failed — this service's own record is authoritative.
      expect((await service.getCase(created.id)).status).toBe('full_appointment');
    });

    it('rejects a second branch decision on an already-decided case', async () => {
      const created = await confirmedCase();
      await service.decideBranch(created.id, { branch: 'econsult', adviceText: 'Advice' }, specialistActor, 'tok');
      await expect(
        service.decideBranch(created.id, { branch: 'full_appointment' }, specialistActor, 'tok'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('requestPathology', () => {
    it('submits via the (mock) pathology ordering provider once extraction is confirmed', async () => {
      const created = await service.createCase(baseCaseDto(), systemActor);
      const extraction = await service.runExtraction(created.id, {}, specialistActor);
      await service.confirmExtraction(created.id, extraction.id, { confirmed: true }, specialistActor);

      const request = await service.requestPathology(
        created.id,
        { requestType: 'pathology', testsRequested: ['FBC', 'TSH'] },
        specialistActor,
      );
      expect(request.status).toBe('sent');
      expect(request.mockProviderReference).toBe('MOCK-1');
      expect(pathologyProvider.submit).toHaveBeenCalledWith(
        expect.objectContaining({ caseId: created.id, requestType: 'pathology', testsRequested: ['FBC', 'TSH'] }),
      );
    });
  });

  describe('completeCase', () => {
    it('requires a branch decision before completing', async () => {
      const created = await service.createCase(baseCaseDto(), systemActor);
      await expect(service.completeCase(created.id, specialistActor, 'tok')).rejects.toBeInstanceOf(ConflictException);
    });

    it('completes the case once a branch has been decided', async () => {
      const created = await service.createCase(baseCaseDto(), systemActor);
      const extraction = await service.runExtraction(created.id, {}, specialistActor);
      await service.confirmExtraction(created.id, extraction.id, { confirmed: true }, specialistActor);
      await service.decideBranch(created.id, { branch: 'full_appointment' }, specialistActor, 'tok');

      const completed = await service.completeCase(created.id, specialistActor, 'tok');
      expect(completed.status).toBe('completed');
      expect(completed.completedAt).not.toBeNull();
      expect(referralServiceClient.completeReview).toHaveBeenCalledWith('ref-1', 'tok');
    });
  });

  describe('cancelCase', () => {
    it('cancels a case from a non-terminal status', async () => {
      const created = await service.createCase(baseCaseDto(), systemActor);
      const cancelled = await service.cancelCase(created.id, 'Patient withdrew referral', specialistActor);
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancelledReason).toBe('Patient withdrew referral');
    });

    it('rejects cancelling an already-completed case', async () => {
      const created = await service.createCase(baseCaseDto(), systemActor);
      const extraction = await service.runExtraction(created.id, {}, specialistActor);
      await service.confirmExtraction(created.id, extraction.id, { confirmed: true }, specialistActor);
      await service.decideBranch(created.id, { branch: 'full_appointment' }, specialistActor, 'tok');
      await service.completeCase(created.id, specialistActor, 'tok');
      await expect(service.cancelCase(created.id, undefined, specialistActor)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('listCases', () => {
    it('filters by patientId, specialistId, and status', async () => {
      await service.createCase(baseCaseDto({ referralId: 'ref-a', patientId: 'p1', specialistId: 's1' }), systemActor);
      await service.createCase(baseCaseDto({ referralId: 'ref-b', patientId: 'p2', specialistId: 's1' }), systemActor);

      expect(await service.listCases({ patientId: 'p1' })).toHaveLength(1);
      expect(await service.listCases({ specialistId: 's1' })).toHaveLength(2);
      expect(await service.listCases({ status: 'received' })).toHaveLength(2);
    });
  });
});
