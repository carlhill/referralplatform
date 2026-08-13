import { Global, Module } from '@nestjs/common';
import { OnboardingAccountClient } from './onboarding-account.client';
import { ConsentSecurityClient } from './consent-security.client';

/**
 * Single shared instance of each downstream-service HTTP client this
 * console calls (onboarding-account for verification-case/practice-
 * onboarding snapshots, consent-security for the deceased-access-request
 * proxy) — `@Global` so every feature module can inject them without each
 * redeclaring its own provider (and, for OnboardingAccountClient, without
 * spinning up a separate ServiceTokenProvider/token cache per module).
 */
@Global()
@Module({
  providers: [OnboardingAccountClient, ConsentSecurityClient],
  exports: [OnboardingAccountClient, ConsentSecurityClient],
})
export class ExternalClientsModule {}
