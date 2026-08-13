import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import type { AuthenticatedRequest } from './authenticated-request';

/**
 * Every screen this console exposes is internal-staff-only (ui-design.md:
 * "Admin/Ops Console (internal staff)") — this is the one access-control
 * check repeated across every controller in this service. A `system`
 * principal (this service's own service-to-service token, e.g. calling
 * itself in a test) is deliberately NOT granted staff access here — only a
 * real Keycloak-authenticated internal_staff user may act through this
 * console, consistent with consent-security's identical `requireStaff` used
 * to gate its deceased-patient access-request queue.
 */
export function requireStaff(req: AuthenticatedRequest): AuthenticatedRequest['auth'] {
  if (!req.auth) {
    throw new UnauthorizedException('Authentication required');
  }
  if (req.auth.principalType !== 'internal_staff') {
    throw new ForbiddenException('Only internal staff may use the Admin/Ops Console');
  }
  return req.auth;
}

export function actorFrom(req: AuthenticatedRequest): ActorRef {
  const auth = requireStaff(req);
  return { principalType: 'internal_staff', id: auth!.sub, displayName: auth!.preferredUsername };
}

/** Forwards the acting staff member's own bearer token to a downstream service — see common/*.client.ts. */
export function authHeader(req: AuthenticatedRequest): string {
  const header = req.headers['authorization'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    throw new UnauthorizedException('Missing bearer token');
  }
  return value;
}
