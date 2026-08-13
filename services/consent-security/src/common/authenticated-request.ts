import type { Request } from 'express';
import type { AuthenticatedPrincipal } from '@referralplatform/auth-client';

/** Populated by BearerAuthGuard before any guarded controller handler runs — mirrors services/gp-authorisation. */
export interface AuthenticatedRequest extends Request {
  auth?: AuthenticatedPrincipal;
}
