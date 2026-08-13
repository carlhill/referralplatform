import { Controller, Delete, Get, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasskeysService } from './passkeys.service';
import type { AuthenticatedRequest } from '../common/authenticated-request';
import { assertStepUp } from '../common/step-up/step-up';

/**
 * All routes here require an authenticated principal (patient, carer, GP,
 * specialist, or internal staff) — enforced by `requireAuth` middleware
 * applied in `app.module.ts`, not by anything in this controller. A caller
 * only ever sees/manages their *own* passkeys — `principal.sub` (the
 * verified Keycloak subject id from the bearer token), never a client-
 * supplied user id, is what scopes every call.
 */
@Controller('passkeys')
export class PasskeysController {
  constructor(
    private readonly passkeys: PasskeysService,
    private readonly config: ConfigService,
  ) {}

  private principal(req: AuthenticatedRequest) {
    if (!req.auth) {
      // Defence in depth: should be unreachable given the middleware wiring
      // above, but a controller must never assume a cross-cutting concern
      // fired correctly.
      throw new UnauthorizedException('Authentication required');
    }
    return req.auth;
  }

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    return this.passkeys.list(this.principal(req));
  }

  @Delete(':credentialId')
  async revoke(@Req() req: AuthenticatedRequest, @Param('credentialId') credentialId: string) {
    const principal = this.principal(req);
    // Revoking a phishing-resistant credential is itself a sensitive,
    // account-security-affecting action — require a recent step-up
    // re-authentication before allowing it (see common/step-up).
    assertStepUp(principal, this.config.get<string>('STEP_UP_ACR', 'passkey'));
    await this.passkeys.revoke(principal, credentialId);
    return { revoked: true };
  }

  /**
   * Forces re-enrolment on next login (GP-assisted device-loss recovery —
   * see identity-security-recommendations.md §6, "Plan for recovery"). Only
   * internal staff or the account owner themselves may trigger this for now;
   * a full GP-assisted-recovery workflow (staff acting on a *different*
   * principal's account) belongs to the Admin/Ops Console service, not here
   * — this endpoint only ever targets the caller's own account.
   */
  @Post('require-reenrolment')
  async requireReenrolment(@Req() req: AuthenticatedRequest) {
    const principal = this.principal(req);
    await this.passkeys.requireReenrolment(principal);
    return { required: true };
  }
}
