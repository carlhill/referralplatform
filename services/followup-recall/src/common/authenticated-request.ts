import type { Request } from 'express';
import type { AuthenticatedPrincipal } from '@referralplatform/auth-client';

/** Populated by BearerAuthGuard before any controller in this service runs. */
export interface AuthenticatedRequest extends Request {
  auth?: AuthenticatedPrincipal;
}
