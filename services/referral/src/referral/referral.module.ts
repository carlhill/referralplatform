import { Module } from '@nestjs/common';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';
import { ReferralQueueExpiryScheduler } from './referral-queue-expiry.scheduler';
import { ComplianceRulesModule } from '../compliance-rules/compliance-rules.module';
import { GpAuthorisationClient } from '../common/gp-authorisation.client';

@Module({
  imports: [ComplianceRulesModule],
  controllers: [ReferralController],
  providers: [ReferralService, ReferralQueueExpiryScheduler, GpAuthorisationClient],
  exports: [ReferralService],
})
export class ReferralModule {}
