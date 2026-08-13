import { Module } from '@nestjs/common';
import { ConsentSecurityClient } from '../common/consent-security.client';
import { DeceasedSuppressionService } from './deceased-suppression.service';
import { DeceasedEventPollerService } from './deceased-event-poller.service';

@Module({
  providers: [ConsentSecurityClient, DeceasedSuppressionService, DeceasedEventPollerService],
  exports: [DeceasedSuppressionService, ConsentSecurityClient],
})
export class DeceasedSuppressionModule {}
