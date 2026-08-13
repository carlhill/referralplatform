import { ConfigService } from '@nestjs/config';
import { AuditOutboxRelayService } from './audit-outbox-relay.service';

class FakePrisma {
  rows: Array<{
    id: string;
    type: string;
    actor: unknown;
    subjectType: string;
    subjectId: string;
    payload: unknown;
    occurredAt: Date;
    publishedAt: Date | null;
  }> = [];

  auditOutbox = {
    findMany: async () => this.rows.filter((r) => r.publishedAt === null),
    update: async ({ where, data }: { where: { id: string }; data: { publishedAt: Date } }) => {
      const row = this.rows.find((r) => r.id === where.id);
      if (row) row.publishedAt = data.publishedAt;
      return row;
    },
  };
}

describe('AuditOutboxRelayService', () => {
  function makeService(prisma: FakePrisma) {
    const config = new ConfigService({
      AUDIT_LOG_SERVICE_URL: 'http://audit-log.local',
      KEYCLOAK_ISSUER: 'http://keycloak.local/realms/referralplatform',
      KEYCLOAK_CLIENT_ID: 'gp-authorisation-service',
      KEYCLOAK_CLIENT_SECRET: 'secret',
    });
    return new AuditOutboxRelayService(prisma as any, config);
  }

  it('publishes every unpublished row and marks it published', async () => {
    const prisma = new FakePrisma();
    prisma.rows.push({
      id: 'row-1',
      type: 'gp.linked',
      actor: { principalType: 'system', id: 'x' },
      subjectType: 'GPLink',
      subjectId: 'link-1',
      payload: {},
      occurredAt: new Date(),
      publishedAt: null,
    });

    const service = makeService(prisma);
    const record = jest.fn().mockResolvedValue({});
    (service as any).auditClient = { record };

    await service.relayPending();

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'gp.linked', subject: { type: 'GPLink', id: 'link-1' } }),
    );
    expect(prisma.rows[0].publishedAt).not.toBeNull();
  });

  it('leaves a row unpublished and does not throw if the Audit Log Service call fails', async () => {
    const prisma = new FakePrisma();
    prisma.rows.push({
      id: 'row-2',
      type: 'gp.link.revoked',
      actor: { principalType: 'patient', id: 'p1' },
      subjectType: 'GPLink',
      subjectId: 'link-2',
      payload: {},
      occurredAt: new Date(),
      publishedAt: null,
    });

    const service = makeService(prisma);
    (service as any).auditClient = { record: jest.fn().mockRejectedValue(new Error('audit-log unreachable')) };

    await expect(service.relayPending()).resolves.toBeUndefined();
    expect(prisma.rows[0].publishedAt).toBeNull();
  });

  it('skips already-published rows', async () => {
    const prisma = new FakePrisma();
    prisma.rows.push({
      id: 'row-3',
      type: 'gp.link.declined',
      actor: { principalType: 'system', id: 'x' },
      subjectType: 'GPLink',
      subjectId: 'link-3',
      payload: {},
      occurredAt: new Date(),
      publishedAt: new Date(),
    });
    const service = makeService(prisma);
    const record = jest.fn();
    (service as any).auditClient = { record };

    await service.relayPending();
    expect(record).not.toHaveBeenCalled();
  });
});
