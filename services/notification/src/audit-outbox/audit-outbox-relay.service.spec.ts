import { ConfigService } from '@nestjs/config';
import { AuditOutboxRelayService } from './audit-outbox-relay.service';

function makeConfig(): ConfigService {
  return {
    getOrThrow: (key: string) =>
      ({
        KEYCLOAK_ISSUER: 'http://keycloak:8080/realms/referralplatform',
        KEYCLOAK_CLIENT_ID: 'notification-service',
        KEYCLOAK_CLIENT_SECRET: 'secret',
        AUDIT_LOG_SERVICE_URL: 'http://audit-log:3012',
      })[key],
    get: () => undefined,
  } as unknown as ConfigService;
}

function makeService(prisma: any) {
  const service = new AuditOutboxRelayService(prisma, makeConfig());
  const record = jest.fn();
  (service as any).auditClient = { record };
  return { service, record };
}

const pendingRow = {
  id: 'row_1',
  type: 'message_thread.created',
  actor: { principalType: 'gp', id: 'gp1' },
  subjectType: 'MessageThread',
  subjectId: 'thread1',
  payload: {},
  occurredAt: new Date('2026-08-13T00:00:00Z'),
  attempts: 0,
};

describe('AuditOutboxRelayService', () => {
  it('relays a pending row to the Audit Log Service and marks it published', async () => {
    const findMany = jest.fn().mockResolvedValue([pendingRow]);
    const update = jest.fn();
    const prisma = { auditOutbox: { findMany, update } };
    const { service, record } = makeService(prisma);
    record.mockResolvedValue({});

    await service.relayPendingEvents();

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message_thread.created', subject: { type: 'MessageThread', id: 'thread1' } }),
    );
    expect(update).toHaveBeenCalledWith({ where: { id: 'row_1' }, data: { publishedAt: expect.any(Date) } });
  });

  it('records attempts/lastError and leaves the row unpublished on failure, rather than throwing', async () => {
    const findMany = jest.fn().mockResolvedValue([pendingRow]);
    const update = jest.fn();
    const prisma = { auditOutbox: { findMany, update } };
    const { service, record } = makeService(prisma);
    record.mockRejectedValue(new Error('Audit Log Service unreachable'));

    await expect(service.relayPendingEvents()).resolves.toBeUndefined();

    expect(update).toHaveBeenCalledWith({
      where: { id: 'row_1' },
      data: { attempts: { increment: 1 }, lastError: expect.stringContaining('unreachable') },
    });
  });

  it('only queries rows that are unpublished and under the max attempt count', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { auditOutbox: { findMany, update: jest.fn() } };
    const { service } = makeService(prisma);

    await service.relayPendingEvents();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publishedAt: null, attempts: { lt: 8 } } }),
    );
  });

  it('skips an overlapping tick while a previous relay run is still in flight', async () => {
    let resolveFirst!: () => void;
    const findMany = jest
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = () => resolve([]))))
      .mockResolvedValue([]);
    const prisma = { auditOutbox: { findMany, update: jest.fn() } };
    const { service } = makeService(prisma);

    const firstTick = service.relayPendingEvents();
    const secondTick = service.relayPendingEvents();
    resolveFirst();
    await Promise.all([firstTick, secondTick]);

    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
