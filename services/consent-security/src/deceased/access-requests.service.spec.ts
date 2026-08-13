import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { AccessRequestsService, type AccessRequestEntity } from './access-requests.service';
import type { DeceasedFlagsService } from './deceased-flags.service';

class FakePrisma {
  requests = new Map<string, AccessRequestEntity>();
  outbox: Array<{ type: string; payload: Record<string, unknown> }> = [];
  private counter = 0;

  accessRequest = {
    create: async ({ data }: { data: Partial<AccessRequestEntity> }) => {
      const id = `req-${++this.counter}`;
      const now = new Date();
      const record: AccessRequestEntity = {
        id,
        deceasedFlagId: data.deceasedFlagId!,
        patientId: data.patientId!,
        requesterName: data.requesterName!,
        requesterEmail: data.requesterEmail ?? null,
        requesterPhone: data.requesterPhone ?? null,
        requesterRelationship: data.requesterRelationship!,
        state: data.state!,
        evidenceDescription: data.evidenceDescription ?? null,
        evidenceDocumentId: data.evidenceDocumentId ?? null,
        status: 'pending',
        reviewedByStaffId: null,
        reviewedAt: null,
        decisionNote: null,
        createdAt: now,
        updatedAt: now,
      };
      this.requests.set(id, record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<AccessRequestEntity> }) => {
      const existing = this.requests.get(where.id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data, updatedAt: new Date() };
      this.requests.set(where.id, updated);
      return updated;
    },
    findUnique: async ({ where }: { where: { id: string } }) => this.requests.get(where.id) ?? null,
    findMany: async ({ where }: { where: { patientId?: string; status?: string } }) =>
      [...this.requests.values()]
        .filter((r) => (where.patientId ? r.patientId === where.patientId : true))
        .filter((r) => (where.status ? r.status === where.status : true)),
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

const staffActor: ActorRef = { principalType: 'internal_staff', id: 'staff-1' };

function fakeDeceasedFlags(flagId = 'flag-1'): DeceasedFlagsService {
  return {
    getActiveFlag: async () => ({ id: flagId }),
  } as unknown as DeceasedFlagsService;
}

describe('AccessRequestsService', () => {
  it('submits a request against an active deceased flag', async () => {
    const prisma = new FakePrisma();
    const service = new AccessRequestsService(prisma as any, fakeDeceasedFlags());

    const request = await service.submit('p1', {
      requesterName: 'Jane Executor',
      requesterRelationship: 'executor',
      state: 'NSW',
    });

    expect(request.status).toBe('pending');
    expect(request.deceasedFlagId).toBe('flag-1');
    // Submission itself is not audited to the immudb-backed trail — see the
    // service's doc comment for why (no matching AuditEventType exists yet).
    expect(prisma.outbox).toHaveLength(0);
  });

  it('propagates NotFoundException when the patient has no active deceased flag', async () => {
    const prisma = new FakePrisma();
    const notDeceased: DeceasedFlagsService = {
      getActiveFlag: async () => {
        throw new NotFoundException('no active flag');
      },
    } as unknown as DeceasedFlagsService;
    const service = new AccessRequestsService(prisma as any, notDeceased);

    await expect(
      service.submit('p1', { requesterName: 'Jane', requesterRelationship: 'executor', state: 'NSW' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('approves a pending request and audits access.request.granted', async () => {
    const prisma = new FakePrisma();
    const service = new AccessRequestsService(prisma as any, fakeDeceasedFlags());
    const request = await service.submit('p1', {
      requesterName: 'Jane',
      requesterRelationship: 'executor',
      state: 'NSW',
    });

    const approved = await service.approve(request.id, staffActor, 'Grant of probate sighted');
    expect(approved.status).toBe('approved');
    expect(approved.reviewedByStaffId).toBe('staff-1');
    expect(prisma.outbox.some((e) => e.type === 'access.request.granted')).toBe(true);
  });

  it('denies a pending request and audits access.request.denied', async () => {
    const prisma = new FakePrisma();
    const service = new AccessRequestsService(prisma as any, fakeDeceasedFlags());
    const request = await service.submit('p1', { requesterName: 'Jane', requesterRelationship: 'other', state: 'NSW' });

    const denied = await service.deny(request.id, staffActor, 'No evidence of authority provided');
    expect(denied.status).toBe('denied');
    expect(prisma.outbox.some((e) => e.type === 'access.request.denied')).toBe(true);
  });

  it('refuses to decide an already-decided request', async () => {
    const prisma = new FakePrisma();
    const service = new AccessRequestsService(prisma as any, fakeDeceasedFlags());
    const request = await service.submit('p1', {
      requesterName: 'Jane',
      requesterRelationship: 'executor',
      state: 'NSW',
    });
    await service.approve(request.id, staffActor);

    await expect(service.approve(request.id, staffActor)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.deny(request.id, staffActor)).rejects.toBeInstanceOf(ConflictException);
  });
});
