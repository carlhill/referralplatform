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

  it('sends the bearer token from getServiceToken (including async providers)', async () => {
    const fetchImpl = mockFetch({ status: 201, body: { id: 'evt_1' } });
    const client = new AuditClient({
      baseUrl: 'http://audit-log:3012',
      getServiceToken: async () => 'async-token',
      fetchImpl,
    });

    await client.record({
      type: 'consent.granted',
      actor: { principalType: 'patient', id: 'patient_1' },
      subject: { type: 'ConsentRecord', id: 'consent_1' },
      payload: {},
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer async-token' }) }),
    );
  });

  it('getEvent fetches a single event by id', async () => {
    const fetchImpl = mockFetch({ status: 200, body: { id: 'evt_1', type: 'referral.created' } });
    const client = new AuditClient({ baseUrl: 'http://audit-log:3012', getServiceToken: () => 't', fetchImpl });

    const result = await client.getEvent('evt_1');

    expect(result).toEqual({ id: 'evt_1', type: 'referral.created' });
    expect(fetchImpl).toHaveBeenCalledWith('http://audit-log:3012/audit-events/evt_1', expect.objectContaining({ method: 'GET' }));
  });

  it('listForSubject queries by subjectType and subjectId', async () => {
    const fetchImpl = mockFetch({ status: 200, body: [{ id: 'evt_1' }, { id: 'evt_2' }] });
    const client = new AuditClient({ baseUrl: 'http://audit-log:3012', getServiceToken: () => 't', fetchImpl });

    const result = await client.listForSubject('Referral', 'ref_1');

    expect(result).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://audit-log:3012/audit-events?subjectType=Referral&subjectId=ref_1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('verify posts to the /verify endpoint and returns the tamper-evidence result', async () => {
    const fetchImpl = mockFetch({ status: 200, body: { eventId: 'evt_1', valid: true, immudbTxId: '42', verifiedAt: '2026-08-13T00:00:00.000Z' } });
    const client = new AuditClient({ baseUrl: 'http://audit-log:3012', getServiceToken: () => 't', fetchImpl });

    const result = await client.verify('evt_1');

    expect(result.valid).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith('http://audit-log:3012/audit-events/evt_1/verify', expect.objectContaining({ method: 'POST' }));
  });

  it('rejects when the request times out (AbortController fires)', async () => {
    const fetchImpl = jest.fn(
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    ) as unknown as typeof fetch;
    const client = new AuditClient({ baseUrl: 'http://audit-log:3012', getServiceToken: () => 't', fetchImpl, timeoutMs: 10 });

    await expect(client.getEvent('evt_1')).rejects.toThrow();
  });
});
