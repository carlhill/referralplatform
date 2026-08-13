import { Module } from '@nestjs/common';
import { VerificationCasesController } from './verification-cases.controller';
import { VerificationCasesService } from './verification-cases.service';

/** OnboardingAccountClient is provided globally by ExternalClientsModule (see common/external-clients.module.ts). */
@Module({
  controllers: [VerificationCasesController],
  providers: [VerificationCasesService],
})
export class VerificationCasesModule {}
