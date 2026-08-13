import { ApiError, apiFetch } from './http';

/**
 * Minimal fetch Response stand-in — this project's jest-environment-jsdom
 * (v20) has no global `Response` constructor, and `apiFetch` (http.ts) only
 * ever touches `.ok`/`.status`/`.statusText`/`.text()` on whatever `fetch`
 * resolves to, so a plain object satisfying that shape is a faithful,
 * dependency-free double — no need to polyfill a real `Response`.
 */
function mockResponse(status: number, body: unknown, statusText = ''): Response {
  const text = body === null || body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => text,
  } as Response;
}

describe('apiFetch', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('attaches the Authorization header when an access token is supplied', async () => {
    const fetchMock = jest.fn(async () => mockResponse(200, { ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await apiFetch('http://svc', '/things', { accessToken: 'tok-123' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
  });

  it('omits the Authorization header when no token is supplied', async () => {
    const fetchMock = jest.fn(async () => mockResponse(200, {}));
    global.fetch = fetchMock as unknown as typeof fetch;

    await apiFetch('http://svc', '/things', {});

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('serialises the body as JSON and sets the method', async () => {
    const fetchMock = jest.fn(async () => mockResponse(200, {}));
    global.fetch = fetchMock as unknown as typeof fetch;

    await apiFetch('http://svc', '/things', { method: 'POST', body: { a: 1 } });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it('builds a query string, omitting undefined/empty values', async () => {
    const fetchMock = jest.fn(async () => mockResponse(200, []));
    global.fetch = fetchMock as unknown as typeof fetch;

    await apiFetch('http://svc', '/things', { query: { status: 'routed', patientId: undefined, empty: '' } });

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe('http://svc/things?status=routed');
  });

  it('throws an ApiError with the status and message from a NestJS-shaped error body', async () => {
    const fetchMock = jest.fn(async () =>
      mockResponse(403, { message: 'Not permitted to cancel this case', statusCode: 403 }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiFetch('http://svc', '/things/1/cancel', { method: 'POST' })).rejects.toMatchObject({
      status: 403,
      message: 'Not permitted to cancel this case',
    });
  });

  it('joins a class-validator array message into one string', async () => {
    const fetchMock = jest.fn(async () =>
      mockResponse(400, { message: ['field a is required', 'field b is required'] }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      await apiFetch('http://svc', '/things', { method: 'POST', body: {} });
      throw new Error('expected apiFetch to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe('field a is required; field b is required');
    }
  });

  it('returns undefined for an empty successful response body', async () => {
    const fetchMock = jest.fn(async () => mockResponse(204, null));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiFetch('http://svc', '/things/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
