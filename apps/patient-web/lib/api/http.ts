/**
 * Thin fetch wrapper shared by every `lib/api/*` client module — a
 * deliberate near-duplicate of apps/gp-portal/lib/api/http.ts (same
 * reasoning: this app's job is to surface loading/error state honestly, not
 * paper over an unreachable backend service). See root CONVENTIONS.md §6 —
 * a shared `packages/*` client library is only justified once 3+ apps need
 * literally identical wire behaviour; until then each app owns its own copy.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  token?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

function buildQueryString(query?: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function parseErrorMessage(res: Response): Promise<{ message: string; body?: unknown }> {
  try {
    const body = await res.json();
    const message = Array.isArray(body?.message) ? body.message.join('; ') : (body?.message ?? res.statusText);
    return { message: String(message), body };
  } catch {
    return { message: res.statusText || `Request failed with status ${res.status}` };
  }
}

export async function apiFetch<T>(baseUrl: string, path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', token, body, query, signal } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}${buildQueryString(query)}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    throw new ApiError(0, `Could not reach ${baseUrl} — is the service running? (${(err as Error).message})`);
  }

  if (!res.ok) {
    const { message, body: errBody } = await parseErrorMessage(res);
    throw new ApiError(res.status, message, errBody);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
