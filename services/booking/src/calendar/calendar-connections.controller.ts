import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CalendarSyncService } from './calendar-sync.service';
import { ConnectCalendarDto } from './dto/connect-calendar.dto';
import { BearerAuthGuard } from '../common/bearer-auth.guard';
import type { AuthenticatedRequest } from '../common/authenticated-request';

/**
 * Calendar connection management — specialist/practice-staff-facing side of
 * the two-way calendar sync (specialist-directory-booking.md). A specialist
 * or their reception staff connects (or re-points) their calendar here;
 * `sync` can also be triggered on demand (in addition to
 * CalendarSyncScheduler's periodic pull) for tests/ops and for "I just
 * changed my availability, refresh now" in the UI.
 */
@Controller('calendar-connections')
export class CalendarConnectionsController {
  constructor(private readonly calendarSync: CalendarSyncService) {}

  private assertSpecialistOrStaff(req: AuthenticatedRequest) {
    const principalType = req.auth?.principalType;
    if (principalType !== 'specialist' && principalType !== 'internal_staff' && principalType !== 'system') {
      throw new ForbiddenException('Only the specialist, their practice system, or internal staff may manage a calendar connection');
    }
  }

  @Post()
  @UseGuards(BearerAuthGuard)
  async connect(@Body() dto: ConnectCalendarDto, @Req() req: AuthenticatedRequest) {
    this.assertSpecialistOrStaff(req);
    return this.calendarSync.connect(dto.specialistId, dto.provider, dto.externalCalendarId);
  }

  @Get(':specialistId')
  @UseGuards(BearerAuthGuard)
  async getConnection(@Param('specialistId') specialistId: string) {
    return this.calendarSync.getConnection(specialistId);
  }

  @Post(':specialistId/sync')
  @UseGuards(BearerAuthGuard)
  async sync(@Param('specialistId') specialistId: string) {
    return this.calendarSync.syncSpecialist(specialistId);
  }
}
