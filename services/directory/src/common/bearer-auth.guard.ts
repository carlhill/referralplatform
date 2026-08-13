import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTokenVerifier } from './clients';
import type { AuthenticatedRequest } from './authenticated-request';

/**
 * Ordinary bearer-token authentication, applied to every write/administrative
 * endpoint this service exposes (self-registration, manual sync trigger,
 * secure-messaging routing). Directory search/pathway-suggestion reads are
 * left unauthenticated at this layer — they return only public directory
 * information other authenticated services (Referral, Booking) or portals
 * already gate on their own side; see BUILD_LOG/directory.md for this
 * judgment call.
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
