import type { Request } from 'express';
import type { AuthenticatedPrincipal } from '@referralplatform/auth-client';

/**
 * `BearerAuthGuard` populates `req.auth` before any controller handler in
 * this service runs (see bearer-auth.guard.ts).
 */
export interface AuthenticatedRequest extends Request {
  auth?: AuthenticatedPrincipal;
}
