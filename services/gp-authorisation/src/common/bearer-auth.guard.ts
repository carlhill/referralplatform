import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTokenVerifier } from './clients';
import type { AuthenticatedRequest } from './authenticated-request';

/**
 * Ordinary bearer-token authentication for patient/carer/staff-facing
 * routes (list, approve, decline, revoke, authorisation-check) — as opposed
 * to `HpioNashAuthGuard`, which additionally enforces the HPI-O/NASH
 * practice-system requirement on `POST /gp-links` only.
 */
@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers['authorization'];
    const value = Array.isArray(header) ? header[0] : header;
    if (!value?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    try {
      req.auth = await createTokenVerifier(this.config).verify(value.slice('Bearer '.length));
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return true;
  }
}
