import { AuditOutboxService } from './audit-outbox.service';

describe('AuditOutboxService', () => {
  it('writes an AuditOutbox row via the given writer (standalone)', async () => {
    const create = jest.fn();
    const prisma = { auditOutbox: { create } } as any;
    const service = new AuditOutboxService(prisma);

    await service.enqueueStandalone({
      type: 'message_thread.created' as any,
      actor: { principalType: 'gp', id: 'gp1' },
      subject: { type: 'MessageThread', id: 'thread1' },
      payload: { referralId: 'ref1' },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'message_thread.created',
        subjectType: 'MessageThread',
        subjectId: 'thread1',
        payload: { referralId: 'ref1' },
      }),
    });
  });

  it('writes to the transaction client (tx) it is given, not always this.prisma', async () => {
    const prismaCreate = jest.fn();
    const txCreate = jest.fn();
    const prisma = { auditOutbox: { create: prismaCreate } } as any;
    const tx = { auditOutbox: { create: txCreate } } as any;
    const service = new AuditOutboxService(prisma);

    await service.enqueue(tx, {
      type: 'message_thread.message_posted' as any,
      actor: { principalType: 'patient', id: 'p1' },
      subject: { type: 'MessageThread', id: 'thread1' },
      payload: {},
    });

    expect(txCreate).toHaveBeenCalled();
    expect(prismaCreate).not.toHaveBeenCalled();
  });

  it('defaults occurredAt to now when not supplied', async () => {
    const create = jest.fn();
    const prisma = { auditOutbox: { create } } as any;
    const service = new AuditOutboxService(prisma);

    const before = Date.now();
    await service.enqueueStandalone({
      type: 'message_thread.resolved' as any,
      actor: { principalType: 'system', id: 's1' },
      subject: { type: 'MessageThread', id: 'thread1' },
      payload: {},
    });
    const after = Date.now();

    const occurredAt: Date = create.mock.calls[0][0].data.occurredAt;
    expect(occurredAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(occurredAt.getTime()).toBeLessThanOrEqual(after);
  });
});
