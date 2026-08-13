import { ConflictException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { ConcernsService, type ConcernEntity } from './concerns.service';
import type { ConsentRecordsService } from '../consent-records/consent-records.service';

class FakePrisma {
  concerns = new Map<string, ConcernEntity>();
  outbox: Array<{ type: string; payload: Record<string, unknown> }> = [];
  private counter = 0;

  concern = {
    create: async ({ data }: { data: Partial<ConcernEntity> }) => {
      const id = `concern-${++this.counter}`;
      const now = new Date();
      const record: ConcernEntity = {
        id,
        patientId: data.patientId!,
        relatedReferralId: data.relatedReferralId ?? null,
        category: data.category!,
        routedTo: data.routedTo!,
        status: data.status ?? 'routed',
        summary: data.summary!,
        gpNotifiedId: data.gpNotifiedId ?? null,
        raisedAt: now,
        resolvedAt: null,
        resolutionNote: null,
        createdAt: now,
        updatedAt: now,
      };
      this.concerns.set(id, record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<ConcernEntity> }) => {
      const existing = this.concerns.get(where.id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data, updatedAt: new Date() };
      this.concerns.set(where.id, updated);
      return updated;
    },
    findUnique: async ({ where }: { where: { id: string } }) => this.concerns.get(where.id) ?? null,
    findMany: async ({ where }: { where: { patientId?: string; status?: string } }) =>
      [...this.concerns.values()]
        .filter((c) => (where.patientId ? c.patientId === where.patientId : true))
        .filter((c) => (where.status ? c.status === where.status : true)),
  };

  auditOutbox = {
    create: async ({ data }: { data: { type: string; payload: Record<string, unknown> } }) => {
      this.outbox.push(data);
      return data;
    },
  };

  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

const actor: ActorRef = { principalType: 'patient', id: 'patient-1' };

function fakeConsentRecords(activeGpIds: string[] = []): ConsentRecordsService {
  return {
    listForPatient: async () => activeGpIds.map((gpId) => ({ subjectId: gpId, revokedAt: null }) as any),
  } as unknown as ConsentRecordsService;
}

describe('ConcernsService', () => {
  it('raises a clinical concern, routes it to AHPRA, and copies a consented GP', async () => {
    const prisma = new FakePrisma();
    const service = new ConcernsService(prisma as any, fakeConsentRecords(['gp-99']));

    const concern = await service.raise(
      {
        patientId: 'p1',
        summary: 'Disagreed with the specialist advice given',
        isAboutHowCareWasHandled: true,
        isAboutSomethingNotWorkingOnThePlatform: false,
        isAboutSomeoneSeeingSomethingTheyShouldnt: false,
        gpNotifiedId: 'gp-99',
      },
      actor,
    );

    expect(concern.category).toBe('clinical_care_or_conduct');
    expect(concern.routedTo).toBe('ahpra_or_state_health_complaints_commissioner');
    expect(concern.gpNotifiedId).toBe('gp-99');
    expect(prisma.outbox.some((e) => e.type === 'concern.raised')).toBe(true);
  });

  it('does not copy a GP the patient has not consented to', async () => {
    const prisma = new FakePrisma();
    const service = new ConcernsService(prisma as any, fakeConsentRecords([])); // no active gp_link consent

    const concern = await service.raise(
      {
        patientId: 'p1',
        summary: 'Disagreed with the specialist advice given',
        isAboutHowCareWasHandled: true,
        isAboutSomethingNotWorkingOnThePlatform: false,
        isAboutSomeoneSeeingSomethingTheyShouldnt: false,
        gpNotifiedId: 'gp-99',
      },
      actor,
    );

    expect(concern.gpNotifiedId).toBeNull();
  });

  it('routes a privacy concern to the Privacy Officer without a GP copy', async () => {
    const prisma = new FakePrisma();
    const service = new ConcernsService(prisma as any, fakeConsentRecords(['gp-99']));

    const concern = await service.raise(
      {
        patientId: 'p1',
        summary: 'A GP I have never met approved seeing my referral',
        isAboutHowCareWasHandled: false,
        isAboutSomethingNotWorkingOnThePlatform: false,
        isAboutSomeoneSeeingSomethingTheyShouldnt: true,
        gpNotifiedId: 'gp-99',
      },
      actor,
    );

    expect(concern.category).toBe('privacy_or_consent_breach');
    expect(concern.routedTo).toBe('privacy_officer');
    expect(concern.gpNotifiedId).toBeNull();
  });

  it('resolves a concern and refuses a double-resolve', async () => {
    const prisma = new FakePrisma();
    const service = new ConcernsService(prisma as any, fakeConsentRecords());
    const concern = await service.raise(
      {
        patientId: 'p1',
        summary: 'The referral has been stuck for 3 days',
        isAboutHowCareWasHandled: false,
        isAboutSomethingNotWorkingOnThePlatform: true,
        isAboutSomeoneSeeingSomethingTheyShouldnt: false,
      },
      actor,
    );

    const resolved = await service.resolve(concern.id, 'Referral requeued and delivered', actor);
    expect(resolved.status).toBe('resolved');
    expect(prisma.outbox.some((e) => e.type === 'concern.resolved')).toBe(true);

    await expect(service.resolve(concern.id, 'again', actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it('escalates a privacy concern to the OAIC but refuses for other categories', async () => {
    const prisma = new FakePrisma();
    const service = new ConcernsService(prisma as any, fakeConsentRecords());

    const privacyConcern = await service.raise(
      {
        patientId: 'p1',
        summary: 'My referral was visible to a GP I never approved',
        isAboutHowCareWasHandled: false,
        isAboutSomethingNotWorkingOnThePlatform: false,
        isAboutSomeoneSeeingSomethingTheyShouldnt: true,
      },
      actor,
    );
    const escalated = await service.escalateToOaic(privacyConcern.id, actor);
    expect(escalated.status).toBe('escalated_to_oaic');

    const platformConcern = await service.raise(
      {
        patientId: 'p1',
        summary: 'Notification never arrived',
        isAboutHowCareWasHandled: false,
        isAboutSomethingNotWorkingOnThePlatform: true,
        isAboutSomeoneSeeingSomethingTheyShouldnt: false,
      },
      actor,
    );
    await expect(service.escalateToOaic(platformConcern.id, actor)).rejects.toBeInstanceOf(ConflictException);
  });
});
