import { Module } from '@nestjs/common';
import { NotificationClient } from './notification.client';
import { ReferralClient } from './referral.client';

/** Cross-cutting outbound clients shared by SlotClaimService, BookingService, and WaitlistService. */
@Module({
  providers: [NotificationClient, ReferralClient],
  exports: [NotificationClient, ReferralClient],
})
export class CommonModule {}
