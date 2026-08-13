import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedPrincipal, TokenVerifier } from '@referralplatform/auth-client';
import { createTokenVerifier } from '../common/clients';

export interface RequestWithAuth extends Request {
  auth?: AuthenticatedPrincipal;
}

/**
 * Every write to the Audit Log Service must be authenticated as the calling
 * service (or as a real end-user for the query/verify endpoints a
 * patient/GP/specialist can reach directly) — never anonymous. See root
 * CONVENTIONS.md ("Using packages/auth-client") and this service's
 * src/common/clients.ts. Wraps packages/auth-client's TokenVerifier in a Nest
 * Guard rather than Express middleware so it composes with @UseGuards() at
 * the controller/route level (health stays public by simply not applying
 * this guard to HealthController).
 */
@Injectable()
export class BearerAuthGuard implements CanActivate {
  private readonly verifier: TokenVerifier;

  constructor(config: ConfigService) {
    this.verifier = createTokenVerifier(config);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.['authorization'];
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    try {
      req.auth = await this.verifier.verify(header.slice('Bearer '.length));
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
