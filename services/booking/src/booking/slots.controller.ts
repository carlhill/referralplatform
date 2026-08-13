import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { SlotsService } from './slots.service';
import { BearerAuthGuard } from '../common/bearer-auth.guard';
import type { TimeOfDayBand } from './slot-matching';

/** Read-only slot visibility — mainly for reception/GP/ops to see what's currently open before proposing it via POST /bookings/:id/confirm, and for tests. */
@Controller('specialists/:specialistId/slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Get()
  @UseGuards(BearerAuthGuard)
  async list(
    @Param('specialistId') specialistId: string,
    @Query('preferredDayOfWeek') preferredDayOfWeek?: string,
    @Query('preferredTimeOfDay') preferredTimeOfDay?: TimeOfDayBand,
  ) {
    if (preferredDayOfWeek || preferredTimeOfDay) {
      return this.slots.rankedCandidates(specialistId, preferredDayOfWeek, preferredTimeOfDay, 50);
    }
    return this.slots.listOpen(specialistId);
  }
}
