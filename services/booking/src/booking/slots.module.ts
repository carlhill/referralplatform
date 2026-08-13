import { Module } from '@nestjs/common';
import { SlotsService } from './slots.service';
import { SlotClaimService } from './slot-claim.service';
import { CalendarModule } from '../calendar/calendar.module';
import { CommonModule } from '../common/common.module';

/**
 * The read-side slot listing/ranking (SlotsService) and the concurrency-critical
 * atomic claim (SlotClaimService) — split out from BookingModule so both
 * BookingModule and WaitlistModule can depend on this one-directionally
 * without a circular module reference (see slot-claim.service.ts's doc
 * comment for why the claim itself lives in its own service).
 */
@Module({
  imports: [CalendarModule, CommonModule],
  providers: [SlotsService, SlotClaimService],
  exports: [SlotsService, SlotClaimService],
})
export class SlotsModule {}
