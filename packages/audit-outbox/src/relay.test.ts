import { backoffMs, BACKOFF_MAX_MS, relayPendingAuditEvents } from './relay';
import type { AuditOutboxRow } from './types';

function row(overrides: Partial<AuditOutboxRow> = {}): AuditOutboxRow {
  return {
    id: 'row-1',
    type: 'referral.created',
    actor: { principalType: 'gp', id: 'gp-1' },
    subjectType: 'Referral',
    subjectId: 'ref-1',
    payload: {},
    occurredAt: new Date('2026-08-17T00:00:00.000Z'),
    attempts: 0,
    ...overrides,
  };
}

/** Captures what the relay would have queried and written, so assertions read as behaviour. */
function fakePrisma(rows: AuditOutboxRow[]) {
  const updates: { where: any; data: any }[] = [];
  const queries: any[] = [];
  return {
    updates,
    queries,
    auditOutbox: {
      findMany: async (args: any) => {
        queries.push(args);
        return rows;
      },
      update: async (args: any) => {
        updates.push(args);
        return {};
      },
    },
  };
}

const silentLogger = { warn: () => undefined, error: () => undefined };

describe('backoffMs', () => {
  it('doubles per attempt', () => {
    expect(backoffMs(1)).toBe(5_000);
    expect(backoffMs(2)).toBe(10_000);
    expect(backoffMs(3)).toBe(20_000);
    expect(backoffMs(4)).toBe(40_000);
  });

  it('caps rather than growing without bound', () => {
    expect(backoffMs(50)).toBe(BACKOFF_MAX_MS);
  });
});

describe('relayPendingAuditEvents', () => {
  it('marks a row published once the Audit Log Service accepts it', async () => {
    const prisma = fakePrisma([row()]);
    const auditClient = { record: jest.fn().mockResolvedValue(undefined) } as any;

    await relayPendingAuditEvents({ prisma, auditClient, logger: silentLogger });

    expect(auditClient.record).toHaveBeenCalledTimes(1);
    expect(prisma.updates).toHaveLength(1);
    expect(prisma.updates[0].data.publishedAt).toBeInstanceOf(Date);
  });

  it('does NOT mark a row published when delivery fails, and schedules a retry', async () => {
    const prisma = fakePrisma([row({ attempts: 2 })]);
    const auditClient = { record: jest.fn().mockRejectedValue(new Error('fetch failed')) } as any;

    await relayPendingAuditEvents({ prisma, auditClient, logger: silentLogger });

    const { data } = prisma.updates[0];
    expect(data.publishedAt).toBeUndefined();
    expect(data.attempts).toEqual({ increment: 1 });
    expect(data.lastError).toBe('fetch failed');
    // attempts becomes 3 -> 20s backoff
    expect(data.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 19_000);
  });

  /**
   * The regression this whole package exists to prevent: a row that has failed many
   * times must stay queued. The previous per-service implementations skipped it
   * permanently once attempts hit 8, which destroyed audit records during ordinary
   * Audit Log Service restarts.
   */
  it('keeps retrying indefinitely — a long-failing row is never abandoned', async () => {
    const prisma = fakePrisma([row({ attempts: 500 })]);
    const auditClient = { record: jest.fn().mockRejectedValue(new Error('still down')) } as any;
    const logger = { warn: jest.fn(), error: jest.fn() };

    await relayPendingAuditEvents({ prisma, auditClient, logger });

    // Still updated with a future retry time rather than dropped or marked published.
    expect(prisma.updates[0].data.nextAttemptAt).toBeInstanceOf(Date);
    expect(prisma.updates[0].data.publishedAt).toBeUndefined();
    // Escalated so it is visible, but escalation is a log level, not a give-up.
    expect(logger.error).toHaveBeenCalled();
  });

  it('only selects rows whose backoff window has elapsed', async () => {
    const prisma = fakePrisma([]);
    const auditClient = { record: jest.fn() } as any;

    await relayPendingAuditEvents({ prisma, auditClient, logger: silentLogger });

    const where = prisma.queries[0].where;
    expect(where.publishedAt).toBeNull();
    expect(where.OR).toEqual([{ nextAttemptAt: null }, { nextAttemptAt: { lte: expect.any(Date) } }]);
    // No attempts cap in the query — that is what made rows unreachable before.
    expect(JSON.stringify(where)).not.toContain('attempts');
  });

  it('continues the batch after one row fails', async () => {
    const prisma = fakePrisma([row({ id: 'a' }), row({ id: 'b' })]);
    const auditClient = {
      record: jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined),
    } as any;

    await relayPendingAuditEvents({ prisma, auditClient, logger: silentLogger });

    expect(auditClient.record).toHaveBeenCalledTimes(2);
    expect(prisma.updates.map((u) => u.where.id)).toEqual(['a', 'b']);
  });
});
