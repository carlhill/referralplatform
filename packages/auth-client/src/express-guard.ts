import type { AuthenticatedPrincipal, TokenVerifier } from './token-verifier';

/**
 * Minimal Express-compatible request/response/next types so this package doesn't
 * need a hard dependency on `express` or `@nestjs/common` — NestJS's default HTTP
 * adapter is Express, so this middleware works as-is inside a Nest app (apply via
 * `app.use(requireAuth(verifier))` in main.ts, or wrap it in a Nest Guard — see
 * root CONVENTIONS.md, "Using packages/auth-client").
 */
export interface MinimalRequest {
  headers: Record<string, string | string[] | undefined>;
  [key: string]: unknown;
  auth?: AuthenticatedPrincipal;
}
export interface MinimalResponse {
  status: (code: number) => MinimalResponse;
  json: (body: unknown) => void;
}
export type NextFn = (err?: unknown) => void;

/**
 * Express/Nest middleware: verifies the `Authorization: Bearer <token>` header
 * and attaches the decoded principal to `req.auth`. Rejects with 401 if missing
 * or invalid.
 */
export function requireAuth(verifier: TokenVerifier) {
  return async (req: MinimalRequest, res: MinimalResponse, next: NextFn) => {
    const header = req.headers['authorization'];
    const value = Array.isArray(header) ? header[0] : header;
    if (!value?.startsWith('Bearer ')) {
      res.status(401).json({ message: 'Missing bearer token' });
      return;
    }
    try {
      req.auth = await verifier.verify(value.slice('Bearer '.length));
      next();
    } catch {
      res.status(401).json({ message: 'Invalid or expired token' });
    }
  };
}

/** Role-check helper for use after `requireAuth` has populated `req.auth`. */
export function requireRole(role: string) {
  return (req: MinimalRequest, res: MinimalResponse, next: NextFn) => {
    if (!req.auth?.roles.includes(role)) {
      res.status(403).json({ message: `Missing required role: ${role}` });
      return;
    }
    next();
  };
}
