import { Module } from '@nestjs/common';
import { ExtractionModule } from '../extraction/extraction.module';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import { MockPathologyOrderingProvider, PATHOLOGY_ORDERING_PROVIDER } from './pathology-ordering.provider';
import { ReferralServiceClient } from '../common/referral-service.client';

@Module({
  imports: [ExtractionModule],
  controllers: [CasesController],
  providers: [
    CasesService,
    MockPathologyOrderingProvider,
    { provide: PATHOLOGY_ORDERING_PROVIDER, useExisting: MockPathologyOrderingProvider },
    ReferralServiceClient,
  ],
})
export class CasesModule {}
