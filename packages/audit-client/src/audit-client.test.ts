import { AuditClient, AuditClientError } from './audit-client';

function mockFetch(response: { status: number; body: unknown }) {
  return jest.fn(
    async () =>
      ({
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        json: async () => response.body,
        text: async () => JSON.stringify(response.body),
      }) as unknown as Response,
  );
}

describe('AuditClient', () => {
  it('records an event and returns the created AuditEvent', async () => {
    const fetchImpl = mockFetch({ status: 201, body: { id: 'evt_1', type: 'referral.created' } });
    const client = new AuditClient({
      baseUrl: 'http://audit-log:3012',
      getServiceToken: () => 'test-token',
      fetchImpl,
    });

    const result = await client.record({
      type: 'referral.created',
      actor: { principalType: 'gp', id: 'gp_1' },
      subject: { type: 'Referral', id: 'ref_1' },
      payload: {},
    });

    expect(result).toEqual({ id: 'evt_1', type: 'referral.created' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://audit-log:3012/audit-events',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws AuditClientError on a non-2xx response', async () => {
    const fetchImpl = mockFetch({ status: 500, body: { message: 'boom' } });
    const client = new AuditClient({
      baseUrl: 'http://audit-log:3012',
      getServiceToken: () => 'test-token',
      fetchImpl,
    });

    await expect(
      client.record({
        type: 'referral.created',
        actor: { principalType: 'gp', id: 'gp_1' },
        subject: { type: 'Referral', id: 'ref_1' },
        payload: {},
      }),
    ).rejects.toBeInstanceOf(AuditClientError);
  });
});
