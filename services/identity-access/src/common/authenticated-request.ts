import type { Request } from 'express';
import type { AuthenticatedPrincipal } from '@referralplatform/auth-client';

/**
 * `packages/auth-client`'s `requireAuth` middleware (applied in
 * `app.module.ts` via `MiddlewareConsumer`, see root CONVENTIONS.md §8)
 * populates `req.auth` before any controller in this file runs. Every
 * controller using this type is listed in that middleware's `.forRoutes(...)`
 * call — if a new authenticated controller is added, it must be added there
 * too, or `req.auth` will be `undefined` and these handlers will throw.
 */
export interface AuthenticatedRequest extends Request {
  auth?: AuthenticatedPrincipal;
}
