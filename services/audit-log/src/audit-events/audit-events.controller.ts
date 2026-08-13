import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { BearerAuthGuard, type RequestWithAuth } from '../auth/bearer-auth.guard';
import { AuditEventsService } from './audit-events.service';
import { CreateAuditEventDto } from './dto/create-audit-event.dto';
import { QueryAuditEventsDto } from './dto/query-audit-events.dto';

/**
 * The write API and query/verification API described in
 * claude/audit-log-architecture-decision.md. See packages/audit-client for
 * the TS client every other service uses to call this — the two must stay
 * in sync (paths, request/response shapes).
 */
@Controller('audit-events')
@UseGuards(BearerAuthGuard)
export class AuditEventsController {
  constructor(private readonly auditEvents: AuditEventsService) {}

  @Post()
  async create(@Body() dto: CreateAuditEventDto) {
    return this.auditEvents.record(dto);
  }

  @Get(':id')
  async getById(@Param('id') id: string, @Query('revealSensitive') revealSensitive: string | undefined, @Req() req: RequestWithAuth) {
    const wantsReveal = revealSensitive === 'true';
    if (wantsReveal && !req.auth?.roles.includes('internal_staff') && req.auth?.principalType !== 'system') {
      throw new ForbiddenException('Only internal staff (or an authorised service) may reveal crypto-shredded fields');
    }
    return this.auditEvents.getById(id, { revealSensitive: wantsReveal });
  }

  @Get()
  async list(@Query() query: QueryAuditEventsDto) {
    return this.auditEvents.listForSubject(query.subjectType, query.subjectId);
  }

  @Post(':id/verify')
  async verify(@Param('id') id: string) {
    return this.auditEvents.verify(id);
  }
}
