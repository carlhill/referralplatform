import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { EventsService } from './events.service';
import { BearerAuthGuard } from '../common/bearer-auth.guard';

/**
 * Polling feed for other services — see events.service.ts's doc comment for
 * why this exists instead of a real message queue for now.
 */
@Controller('events')
@UseGuards(BearerAuthGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  async list(@Query('type') type?: string, @Query('since') since?: string) {
    return this.events.listSince(type, since ? new Date(since) : undefined);
  }
}
