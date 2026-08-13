import { AuditOutboxService } from './audit-outbox.service';

describe('AuditOutboxService', () => {
  it('writes an AuditOutbox row via the given writer (standalone)', async () => {
    const create = jest.fn();
    const prisma = { auditOutbox: { create } } as any;
    const service = new AuditOutboxService(prisma);

    await service.enqueueStandalone({
      type: 'account.activated',
      actor: { principalType: 'patient', id: 'p1' },
      subject: { type: 'Patient', id: 'p1' },
      payload: { foo: 'bar' },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'account.activated',
        subjectType: 'Patient',
        subjectId: 'p1',
        payload: { foo: 'bar' },
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
      type: 'carer.registered',
      actor: { principalType: 'carer', id: 'c1' },
      subject: { type: 'Patient', id: 'p1' },
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
      type: 'account.activated',
      actor: { principalType: 'system', id: 's1' },
      subject: { type: 'Patient', id: 'p1' },
      payload: {},
    });
    const after = Date.now();

    const occurredAt: Date = create.mock.calls[0][0].data.occurredAt;
    expect(occurredAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(occurredAt.getTime()).toBeLessThanOrEqual(after);
  });
});
