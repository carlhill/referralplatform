import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTokenVerifier } from './clients';
import { mockVerifyPracticeSystemAuthorised } from './mock-nash-auth';
import type { AuthenticatedRequest } from './authenticated-request';

/**
 * Enforces "only HPI-O/NASH-authenticated practice systems can request a
 * link" (root CONVENTIONS.md's GP Authorisation Service requirement, from
 * claude/modules-and-requirements.md's "GP Authorisation" functional
 * requirements). See src/common/mock-nash-auth.ts for exactly what's mocked
 * and why. Applied only to `POST /gp-links` (the link-request endpoint a
 * practice system calls) — not to the patient-facing approve/decline/revoke
 * routes, which are gated by ordinary `requireAuth` + step-up instead (see
 * gp-links.controller.ts).
 */
@Injectable()
export class HpioNashAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers['authorization'];
    const value = Array.isArray(header) ? header[0] : header;
    if (!value?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token — practice systems must authenticate to request a GP link');
    }

    const verifier = createTokenVerifier(this.config);
    try {
      req.auth = await verifier.verify(value.slice('Bearer '.length));
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (req.auth.principalType !== 'gp' && req.auth.principalType !== 'system') {
      throw new ForbiddenException(
        'Only a GP practice system (or an internal system principal acting on one) may request a GP link',
      );
    }

    const practiceHpiO = (req.body as { practiceHpiO?: string } | undefined)?.practiceHpiO;
    if (!practiceHpiO || !mockVerifyPracticeSystemAuthorised(practiceHpiO)) {
      throw new ForbiddenException(
        'practiceHpiO is missing or not a recognised, NASH-authenticated Healthcare Provider Identifier — Organisation (MOCK check, see src/common/mock-nash-auth.ts)',
      );
    }

    return true;
  }
}
