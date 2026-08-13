import { Module } from '@nestjs/common';
import { PracticeOnboardingController } from './practice-onboarding.controller';
import { PracticeOnboardingService } from './practice-onboarding.service';

/** OnboardingAccountClient is provided globally by ExternalClientsModule (see common/external-clients.module.ts). */
@Module({
  controllers: [PracticeOnboardingController],
  providers: [PracticeOnboardingService],
})
export class PracticeOnboardingModule {}
