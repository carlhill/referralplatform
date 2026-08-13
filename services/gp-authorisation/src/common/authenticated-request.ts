import type { Request } from 'express';
import type { AuthenticatedPrincipal } from '@referralplatform/auth-client';

/**
 * `packages/auth-client`'s `requireAuth` middleware (applied in
 * `app.module.ts` via `MiddlewareConsumer` — see root CONVENTIONS.md §8)
 * populates `req.auth` before any controller in this file runs.
 */
export interface AuthenticatedRequest extends Request {
  auth?: AuthenticatedPrincipal;
}
