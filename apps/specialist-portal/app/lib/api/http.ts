/**
 * Shared fetch wrapper for every backend service this app calls. Real HTTP
 * calls to real NestJS services (per root CONVENTIONS.md §6 — "plain
 * REST/HTTP... Don't build a bespoke packages/<x>-client library unless
 * three or more services need it"; a frontend app calling many backend
 * services directly with `fetch` is exactly the pattern that section
 * describes, just centralised once per app rather than duplicated per call
 * site).
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

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  accessToken?: string | null;
  /** Query params — undefined values are omitted, not sent as "undefined". */
  query?: Record<string, string | number | boolean | undefined>;
}

function buildQueryString(query?: ApiRequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

/**
 * Calls `${baseUrl}${path}` with a JSON body/response, attaching
 * `Authorization: Bearer <accessToken>` when one is supplied. Every backend
 * route this app calls is behind `BearerAuthGuard` (see e.g.
 * services/specialist-review/src/common/bearer-auth.guard.ts) — a request
 * with no token, or an expired/invalid one, comes back 401 and is surfaced
 * as an `ApiError` the caller can render.
 */
export async function apiFetch<T>(baseUrl: string, path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  const res = await fetch(`${baseUrl}${path}${buildQueryString(options.query)}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const data = text ? safeJsonParse(text) : undefined;

  if (!res.ok) {
    const message = extractErrorMessage(data) ?? res.statusText ?? `Request to ${path} failed`;
    throw new ApiError(res.status, message, data);
  }

  return data as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(data: unknown): string | undefined {
  if (data && typeof data === 'object' && 'message' in data) {
    const msg = (data as { message: unknown }).message;
    if (Array.isArray(msg)) return msg.join('; ');
    if (typeof msg === 'string') return msg;
  }
  return undefined;
}
