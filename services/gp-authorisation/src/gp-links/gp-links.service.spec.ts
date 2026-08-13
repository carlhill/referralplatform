import { ConflictException, GoneException, NotFoundException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { GpLinksService, type GpLinkRecord } from './gp-links.service';

/**
 * A small hand-rolled fake standing in for PrismaService, shaped exactly
 * like the calls GpLinksService actually makes (`gpLink.*`, `auditOutbox.*`,
 * `$transaction`) — the same pattern services/audit-log's
 * audit-events.service.spec.ts uses. `$transaction` just invokes the
 * callback with `this` (the same fake), which is enough to exercise the
 * real transactional logic without a live Postgres connection.
 */
class FakePrisma {
  links = new Map<string, GpLinkRecord>();
  outbox: Array<{
    type: string;
    actor: ActorRef;
    subjectType: string;
    subjectId: string;
    payload: Record<string, unknown>;
  }> = [];
  private counter = 0;

  gpLink = {
    create: async ({ data }: { data: Partial<GpLinkRecord> }) => {
      const id = `link-${++this.counter}`;
      const now = new Date();
      const record: GpLinkRecord = {
        id,
        patientId: data.patientId!,
        gpId: data.gpId!,
        practiceHpiO: data.practiceHpiO!,
        status: data.status ?? 'pending_patient_approval',
        approvalRequestedAt: data.approvalRequestedAt ?? now,
        approvalExpiresAt: data.approvalExpiresAt!,
        approvedAt: data.approvedAt ?? null,
        declinedAt: null,
        revokedAt: null,
        urgentEscalation: data.urgentEscalation ?? false,
        urgentJustification: data.urgentJustification ?? null,
        approvedByPrincipalId: data.approvedByPrincipalId ?? null,
        declinedByPrincipalId: null,
        revokedByPrincipalId: null,
        createdAt: now,
        updatedAt: now,
      };
      this.links.set(id, record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<GpLinkRecord> }) => {
      const existing = this.links.get(where.id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data, updatedAt: new Date() } as GpLinkRecord;
      this.links.set(where.id, updated);
      return updated;
    },
    findUnique: async ({ where }: { where: { id: string } }) => this.links.get(where.id) ?? null,
    findFirst: async ({ where }: { where: { patientId?: string; gpId?: string; status?: unknown } }) => {
      const all = [...this.links.values()]
        .filter((l) => (where.patientId ? l.patientId === where.patientId : true))
        .filter((l) => (where.gpId ? l.gpId === where.gpId : true))
        .filter((l) => {
          if (!where.status) return true;
          const statusIn = (where.status as { in?: string[] }).in;
          return statusIn ? statusIn.includes(l.status) : true;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return all[0] ?? null;
    },
    findMany: async ({ where }: { where: Record<string, unknown> }) => {
      return [...this.links.values()].filter((l) => {
        if (where.patientId && l.patientId !== where.patientId) return false;
        if (where.gpId && l.gpId !== where.gpId) return false;
        if (where.status && typeof where.status === 'string' && l.status !== where.status) return false;
        if (where.approvalExpiresAt) {
          const lt = (where.approvalExpiresAt as { lt?: Date }).lt;
          if (lt && !(l.approvalExpiresAt.getTime() < lt.getTime())) return false;
        }
        return true;
      });
    },
  };

  auditOutbox = {
    create: async ({
      data,
    }: {
      data: { type: string; actor: ActorRef; subjectType: string; subjectId: string; payload: Record<string, unknown> };
    }) => {
      this.outbox.push(data);
      return data;
    },
  };

  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

const actor: ActorRef = { principalType: 'gp', id: 'gp-1', healthcareIdentifier: '8003624900001234' as any };
const patientActor: ActorRef = { principalType: 'patient', id: 'patient-1' };

describe('GpLinksService', () => {
  let prisma: FakePrisma;
  let service: GpLinksService;

  beforeEach(() => {
    prisma = new FakePrisma();
    service = new GpLinksService(prisma as any);
  });

  it('creates a pending link request and writes an outbox row', async () => {
    const link = await service.requestLink({ patientId: 'p1', gpId: 'gp1', practiceHpiO: '8003624900001111' }, actor);
    expect(link.status).toBe('pending_patient_approval');
    expect(link.approvalExpiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(prisma.outbox).toHaveLength(1);
    expect(prisma.outbox[0].type).toBe('gp.link.requested');
  });

  it('is idempotent when a link is already approved', async () => {
    const link = await service.requestLink({ patientId: 'p1', gpId: 'gp1', practiceHpiO: '8003624900001111' }, actor);
    await service.approve(link.id, patientActor);

    const second = await service.requestLink({ patientId: 'p1', gpId: 'gp1', practiceHpiO: '8003624900001111' }, actor);
    expect(second.id).toBe(link.id);
    expect(second.status).toBe('approved');
  });

  it('rejects a duplicate pending request for the same patient/GP pair', async () => {
    await service.requestLink({ patientId: 'p1', gpId: 'gp1', practiceHpiO: '8003624900001111' }, actor);
    await expect(
      service.requestLink({ patientId: 'p1', gpId: 'gp1', practiceHpiO: '8003624900001111' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('urgent-bypass escalation auto-approves and requires a justification', async () => {
    await expect(
      service.requestLink(
        { patientId: 'p1', gpId: 'gp1', practiceHpiO: '8003624900001111', urgentEscalation: true },
        actor,
      ),
    ).rejects.toThrow('urgentJustification is required');

    const link = await service.requestLink(
      {
        patientId: 'p1',
        gpId: 'gp1',
        practiceHpiO: '8003624900001111',
        urgentEscalation: true,
        urgentJustification: 'Acute presentation, GP needs to refer immediately',
      },
      actor,
    );
    expect(link.status).toBe('approved');
    expect(link.urgentEscalation).toBe(true);
    expect(prisma.outbox.some((e) => e.type === 'gp.linked' && e.payload.autoApproved === true)).toBe(true);
  });

  it('approves a pending link', async () => {
    const link = await service.requestLink({ patientId: 'p1', gpId: 'gp1', practiceHpiO: '8003624900001111' }, actor);
    const approved = await service.approve(link.id, patientActor);
    expect(approved.status).toBe('approved');
    expect(approved.approvedByPrincipalId).toBe('patient-1');
    expect(prisma.outbox.some((e) => e.type === 'gp.linked')).toBe(true);
  });

  it('declines a pending link', async () => {
    const link = await service.requestLink({ patientId: 'p1', gpId: 'gp1', practiceHpiO: '8003624900001111' }, actor);
    const declined = await service.decline(link.id, patientActor, 'Not my current GP');
    expect(declined.status).toBe('declined');
    expect(prisma.outbox.some((e) => e.type === 'gp.link.declined' && e.payload.reason === 'Not my current GP')).toBe(
      true,
    );
  });

  it('revokes an approved link', async () => {
    const link = await service.requestLink({ patientId: 'p1', gpId: 'gp1', practiceHpiO: '8003624900001111' }, actor);
    await service.approve(link.id, patientActor);
    const revoked = await service.revoke(link.id, patientActor, 'Changed practice');
    expect(revoked.status).toBe('revoked');
    expect(prisma.outbox.some((e) => e.type === 'gp.link.revoked')).toBe(true);
  });

  it('refuses to revoke a link that is not approved', async () => {
    const link = await service.requestLink({ patientId: 'p1', gpId: 'gp1', practiceHpiO: '8003624900001111' }, actor);
    await expect(service.revoke(link.id, patientActor)).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws NotFoundException for an unknown link id', async () => {
    await expect(service.getById('does-not-exist')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports authorised: false with status no_link when nothing exists', async () => {
    const result = await service.checkAuthorisation('p1', 'gp1');
    expect(result).toEqual({ authorised: false, status: 'no_link' });
  });

  it('reports authorised: true only once approved', async () => {
    const link = await service.requestLink({ patientId: 'p1', gpId: 'gp1', practiceHpiO: '8003624900001111' }, actor);
    expect(await service.checkAuthorisation('p1', 'gp1')).toEqual({
      authorised: false,
      status: 'pending_patient_approval',
      linkId: link.id,
    });
    await service.approve(link.id, patientActor);
    expect(await service.checkAuthorisation('p1', 'gp1')).toEqual({
      authorised: true,
      status: 'approved',
      linkId: link.id,
    });
  });

  it('expires a stale pending link and blocks approval of it', async () => {
    const link = await service.requestLink({ patientId: 'p1', gpId: 'gp1', practiceHpiO: '8003624900001111' }, actor);
    // Force the approval window into the past to simulate the 2-day timeout.
    const stale = prisma.links.get(link.id)!;
    stale.approvalExpiresAt = new Date(Date.now() - 1000);

    await expect(service.approve(link.id, patientActor)).rejects.toBeInstanceOf(GoneException);
    expect(prisma.links.get(link.id)!.status).toBe('expired');
    expect(prisma.outbox.some((e) => e.type === 'gp.link.declined' && e.payload.reason === 'expired_no_response')).toBe(
      true,
    );
  });

  it('expireStalePendingLinks sweeps every stale pending link', async () => {
    const a = await service.requestLink({ patientId: 'p1', gpId: 'gpA', practiceHpiO: '8003624900001111' }, actor);
    const b = await service.requestLink({ patientId: 'p2', gpId: 'gpB', practiceHpiO: '8003624900001111' }, actor);
    prisma.links.get(a.id)!.approvalExpiresAt = new Date(Date.now() - 1000);
    prisma.links.get(b.id)!.approvalExpiresAt = new Date(Date.now() + 1000 * 60 * 60);

    const count = await service.expireStalePendingLinks();
    expect(count).toBe(1);
    expect(prisma.links.get(a.id)!.status).toBe('expired');
    expect(prisma.links.get(b.id)!.status).toBe('pending_patient_approval');
  });
});
