import { NotFoundException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { MessageThreadService } from './message-thread.service';
import { AuditOutboxService } from '../audit-outbox/audit-outbox.service';
import { NotificationService } from '../notifications/notification.service';

/**
 * Hand-rolled fake standing in for PrismaService, shaped like the calls
 * MessageThreadService actually makes (including nested-create and
 * `$transaction`) — same pattern as referral.service.spec.ts's FakePrisma.
 */
class FakePrisma {
  threads = new Map<string, any>();
  participants = new Map<string, any>();
  messages = new Map<string, any>();
  outbox: any[] = [];
  private counter = 0;

  private withRelations(thread: any) {
    return {
      ...thread,
      participants: [...this.participants.values()].filter((p) => p.threadId === thread.id),
      messages: [...this.messages.values()]
        .filter((m) => m.threadId === thread.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    };
  }

  messageThread = {
    findFirst: async ({ where }: { where: { referralId: string } }) => {
      const found = [...this.threads.values()].find((t) => t.referralId === where.referralId);
      return found ? this.withRelations(found) : null;
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      const found = this.threads.get(where.id);
      return found ? this.withRelations(found) : null;
    },
    create: async ({ data }: { data: any }) => {
      const id = `thread-${++this.counter}`;
      const now = new Date();
      const thread = {
        id,
        referralId: data.referralId,
        subject: data.subject ?? null,
        status: data.status ?? 'open',
        createdByType: data.createdByType,
        createdById: data.createdById,
        resolvedAt: null,
        resolvedByType: null,
        resolvedById: null,
        resolutionNote: null,
        createdAt: now,
        updatedAt: now,
      };
      this.threads.set(id, thread);
      for (const p of data.participants?.create ?? []) {
        const pid = `participant-${++this.counter}`;
        this.participants.set(pid, { id: pid, threadId: id, joinedAt: new Date(), ...p });
      }
      for (const m of data.messages?.create ?? []) {
        const mid = `message-${++this.counter}`;
        this.messages.set(mid, { id: mid, threadId: id, createdAt: new Date(), ...m });
      }
      return this.withRelations(thread);
    },
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const existing = this.threads.get(where.id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data, updatedAt: new Date() };
      this.threads.set(where.id, updated);
      return this.withRelations(updated);
    },
  };

  messageThreadMessage = {
    findMany: async ({ where }: { where: { threadId: string } }) =>
      [...this.messages.values()]
        .filter((m) => m.threadId === where.threadId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    create: async ({ data }: { data: any }) => {
      const id = `message-${++this.counter}`;
      const record = { id, createdAt: new Date(), ...data };
      this.messages.set(id, record);
      return record;
    },
  };

  messageThreadParticipant = {
    upsert: async ({ where, create, update }: { where: any; create: any; update: any }) => {
      const key = where.threadId_principalType_principalId;
      const existing = [...this.participants.values()].find(
        (p) =>
          p.threadId === key.threadId && p.principalType === key.principalType && p.principalId === key.principalId,
      );
      if (existing) {
        const updated = { ...existing, ...update };
        this.participants.set(existing.id, updated);
        return updated;
      }
      const id = `participant-${++this.counter}`;
      const record = { id, joinedAt: new Date(), ...create };
      this.participants.set(id, record);
      return record;
    },
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

const gpActor: ActorRef = { principalType: 'gp', id: 'gp-1', displayName: 'Dr Smith' };
const patientActor: ActorRef = { principalType: 'patient', id: 'patient-1', displayName: 'Alex' };
const specialistActor: ActorRef = { principalType: 'specialist', id: 'spec-1', displayName: 'Dr Lee' };

function makeService() {
  const prisma = new FakePrisma();
  const auditOutbox = new AuditOutboxService(prisma as any);
  const notifications = { sendPush: jest.fn().mockResolvedValue([]) } as unknown as NotificationService;
  const service = new MessageThreadService(prisma as any, auditOutbox, notifications);
  return { service, prisma, notifications };
}

describe('MessageThreadService', () => {
  it('creates a thread lazily on first use, with the caller as a participant, and audits it', async () => {
    const { service, prisma } = makeService();
    const thread = await service.createOrGet('ref-1', gpActor, { subject: 'Declined referral', participants: [] });

    expect(thread.referralId).toBe('ref-1');
    expect(thread.status).toBe('open');
    expect(thread.participants).toHaveLength(1);
    expect(thread.participants[0].principalId).toBe('gp-1');
    expect(prisma.outbox.some((e) => e.type === 'message_thread.created')).toBe(true);
  });

  it('is idempotent — a second createOrGet for the same referral returns the existing thread, no duplicate audit', async () => {
    const { service, prisma } = makeService();
    const first = await service.createOrGet('ref-1', gpActor, {});
    const second = await service.createOrGet('ref-1', patientActor, {});

    expect(second.id).toBe(first.id);
    expect(prisma.outbox.filter((e) => e.type === 'message_thread.created')).toHaveLength(1);
  });

  it('creates initial participants and an initial message together, and notifies the other participants', async () => {
    const { service, notifications } = makeService();
    const thread = await service.createOrGet('ref-1', gpActor, {
      participants: [{ principalType: 'patient', principalId: 'patient-1', displayName: 'Alex' }],
      initialMessage: 'Please choose an alternative specialist',
    });

    expect(thread.participants).toHaveLength(2);
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0].body).toBe('Please choose an alternative specialist');
    expect(notifications.sendPush).toHaveBeenCalledTimes(1);
    expect(notifications.sendPush).toHaveBeenCalledWith(
      expect.objectContaining({ recipientType: 'patient', recipientId: 'patient-1' }),
    );
  });

  it('postMessage adds a message, auto-joins an unlisted sender, and notifies other participants but not the sender', async () => {
    const { service, notifications } = makeService();
    const thread = await service.createOrGet('ref-1', gpActor, {
      participants: [{ principalType: 'patient', principalId: 'patient-1' }],
    });

    await service.postMessage(thread.id, specialistActor, 'I can see this patient next Tuesday');

    const reloaded = await service.getById(thread.id);
    expect(reloaded.messages).toHaveLength(1);
    expect(reloaded.participants.map((p) => p.principalId).sort()).toEqual(['gp-1', 'patient-1', 'spec-1']);
    // notified everyone except the specialist who just posted
    const notifiedIds = (notifications.sendPush as jest.Mock).mock.calls.map((c) => c[0].recipientId);
    expect(notifiedIds.sort()).toEqual(['gp-1', 'patient-1']);
  });

  it('postMessage throws NotFoundException for an unknown thread', async () => {
    const { service } = makeService();
    await expect(service.postMessage('nope', gpActor, 'hi')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolve marks the thread resolved and is idempotent (second call is a no-op, no duplicate audit)', async () => {
    const { service, prisma } = makeService();
    const thread = await service.createOrGet('ref-1', gpActor, {});

    const resolved = await service.resolve(thread.id, gpActor, 'Patient booked directly');
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolutionNote).toBe('Patient booked directly');

    const again = await service.resolve(thread.id, gpActor, 'ignored');
    expect(again.status).toBe('resolved');
    expect(prisma.outbox.filter((e) => e.type === 'message_thread.resolved')).toHaveLength(1);
  });

  it('posting a new message re-opens a resolved thread', async () => {
    const { service } = makeService();
    const thread = await service.createOrGet('ref-1', gpActor, {});
    await service.resolve(thread.id, gpActor);

    await service.postMessage(thread.id, patientActor, 'Actually I still need help');
    const reloaded = await service.getById(thread.id);
    expect(reloaded.status).toBe('open');
    expect(reloaded.resolvedAt).toBeNull();
  });

  it('addParticipant upserts a participant and audits it', async () => {
    const { service, prisma } = makeService();
    const thread = await service.createOrGet('ref-1', gpActor, {});
    const participant = await service.addParticipant(thread.id, gpActor, {
      principalType: 'specialist',
      principalId: 'spec-1',
      displayName: 'Dr Lee',
    });

    expect(participant.principalId).toBe('spec-1');
    expect(prisma.outbox.some((e) => e.type === 'message_thread.participant_added')).toBe(true);
  });

  it('getByReferralId returns null when no thread exists yet', async () => {
    const { service } = makeService();
    expect(await service.getByReferralId('no-such-referral')).toBeNull();
  });
});
