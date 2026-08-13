import { Body, Controller, Param, Post } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { CreateActivationRequestDto } from './dto/create-activation-request.dto';
import { VerifyIdentityDto } from './dto/verify-identity.dto';
import { SelectBranchDto } from './dto/select-branch.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

/**
 * The patient/carer onboarding flow — see identity-security-recommendations.md
 * §3 and modules-and-requirements.md ("Onboarding & Account"). Every route
 * after the initial GP-triggered request is keyed off the single-use
 * activation token embedded in the email link, not a Keycloak session — the
 * whole point of this flow is to activate an account for someone who does
 * not have one yet.
 *
 * KNOWN GAP: these routes are not yet behind `requireAuth` for the
 * GP-triggering step (`POST /account-activation-requests` should require an
 * authenticated GP/practice-system principal, not just a
 * `triggeringGpId`/`triggeringGpHpiO` supplied in the body) — see
 * BUILD_LOG/onboarding-account.md. `assertVerifiedPractice()` in
 * `onboarding.service.ts` provides a real, enforced authorisation check
 * (the HPI-O must belong to a verified, compliance-acknowledged practice),
 * but does not yet verify that the *caller* is that practice's own system —
 * that requires wiring `packages/auth-client`'s `requireAuth` plus a
 * GP/practice-system principal type check, deferred here pending the GP
 * Authorisation Service's own auth wiring since the two are closely related.
 */
@Controller()
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('account-activation-requests')
  requestActivation(@Body() dto: CreateActivationRequestDto) {
    return this.onboarding.requestActivation(dto);
  }

  @Post('account-activation/:token/verify-identity')
  verifyIdentity(@Param('token') token: string, @Body() dto: VerifyIdentityDto) {
    return this.onboarding.verifyIdentity(token, dto);
  }

  @Post('account-activation/:token/branch')
  selectBranch(@Param('token') token: string, @Body() dto: SelectBranchDto) {
    return this.onboarding.selectBranch(token, dto);
  }

  @Post('account-activation/:token/otp/verify')
  verifyOtp(@Param('token') token: string, @Body() dto: VerifyOtpDto) {
    return this.onboarding.verifyOtp(token, dto);
  }

  @Post('account-activation/:token/otp/resend')
  resendOtp(@Param('token') token: string) {
    return this.onboarding.resendOtp(token);
  }
}
