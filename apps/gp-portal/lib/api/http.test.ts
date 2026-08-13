import { apiFetch, ApiError } from './http';

describe('apiFetch', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns parsed JSON on a 2xx response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: '123' }),
    }) as unknown as typeof fetch;

    const result = await apiFetch<{ id: string }>('http://example.test', '/things/123');
    expect(result).toEqual({ id: '123' });
  });

  it('sends the Authorization header when a token is supplied', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;

    await apiFetch('http://example.test', '/things', { token: 'abc123' });
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc123');
  });

  it('serializes query params, dropping undefined/empty values', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;

    await apiFetch('http://example.test', '/things', { query: { a: '1', b: undefined, c: '' } });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://example.test/things?a=1');
  });

  it('throws an ApiError with the NestJS error message on a non-2xx response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ statusCode: 403, message: 'Not authorised', error: 'Forbidden' }),
    }) as unknown as typeof fetch;

    await expect(apiFetch('http://example.test', '/things')).rejects.toMatchObject({
      status: 403,
      message: 'Not authorised',
    });
  });

  it('joins array-shaped class-validator messages', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ statusCode: 400, message: ['field a is required', 'field b is required'] }),
    }) as unknown as typeof fetch;

    await expect(apiFetch('http://example.test', '/things')).rejects.toThrow('field a is required; field b is required');
  });

  it('wraps a network failure in an ApiError with status 0', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed')) as unknown as typeof fetch;

    const err = await apiFetch('http://example.test', '/things').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
  });
});
