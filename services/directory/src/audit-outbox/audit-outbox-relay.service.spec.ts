jest.mock('@referralplatform/audit-outbox', () => ({
  relayPendingAuditEvents: jest.fn(),
}));

import { ConfigService } from '@nestjs/config';
import { relayPendingAuditEvents } from '@referralplatform/audit-outbox';
import { AuditOutboxRelayService } from './audit-outbox-relay.service';

const mockRelay = relayPendingAuditEvents as jest.Mock;

/**
 * This spec deliberately covers only what the wrapper itself owns: scheduling and the
 * skip-if-already-running guard.
 *
 * Publishing, retry and backoff behaviour used to be tested here too — in four
 * near-identical copies across services, which is exactly the duplication that let the
 * relays drift into two different broken retry policies without anyone noticing. That
 * logic now lives in `@referralplatform/audit-outbox` and is tested once, properly,
 * there (including a regression test that a long-failing row is never abandoned).
 * Do not reintroduce copies of those assertions here.
 */
describe('AuditOutboxRelayService (scheduling wrapper)', () => {
  function makeService() {
    const config = new ConfigService({
      AUDIT_LOG_SERVICE_URL: 'http://audit-log.local',
      KEYCLOAK_ISSUER: 'http://keycloak.local/realms/referralplatform',
      KEYCLOAK_CLIENT_ID: 'directory-service',
      KEYCLOAK_CLIENT_SECRET: 'secret',
    });
    return new AuditOutboxRelayService({} as any, config);
  }

  beforeEach(() => mockRelay.mockReset());

  it('delegates a tick to the shared relay implementation', async () => {
    mockRelay.mockResolvedValue(undefined);

    await makeService().relayPendingEvents();

    expect(mockRelay).toHaveBeenCalledTimes(1);
    const args = mockRelay.mock.calls[0][0];
    expect(args).toHaveProperty('prisma');
    expect(args).toHaveProperty('auditClient');
    expect(args).toHaveProperty('logger');
  });

  it('skips a tick while the previous one is still in flight', async () => {
    let release: () => void = () => undefined;
    mockRelay.mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));
    const service = makeService();

    const first = service.relayPendingEvents();
    await service.relayPendingEvents(); // overlapping tick — must be a no-op
    release();
    await first;

    expect(mockRelay).toHaveBeenCalledTimes(1);
  });

  it('swallows a failed tick so the schedule keeps running', async () => {
    mockRelay.mockRejectedValue(new Error('audit log unreachable'));
    const service = makeService();

    await expect(service.relayPendingEvents()).resolves.toBeUndefined();

    // and the guard is released, so the next tick still runs
    mockRelay.mockResolvedValue(undefined);
    await service.relayPendingEvents();
    expect(mockRelay).toHaveBeenCalledTimes(2);
  });
});
