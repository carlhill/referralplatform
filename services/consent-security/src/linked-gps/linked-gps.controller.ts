import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { LinkedGpsService } from './linked-gps.service';
import { DecisionReasonDto } from './dto/decision-reason.dto';
import { BearerAuthGuard } from '../common/bearer-auth.guard';
import type { AuthenticatedRequest } from '../common/authenticated-request';

function authHeader(req: AuthenticatedRequest): string {
  const header = req.headers['authorization'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    throw new UnauthorizedException('Missing bearer token');
  }
  return value;
}

/** Consent page: "linked GPs and practices" list + revoke — see linked-gps.service.ts. */
@Controller('consent/linked-gps')
@UseGuards(BearerAuthGuard)
export class LinkedGpsController {
  constructor(private readonly linkedGps: LinkedGpsService) {}

  @Get()
  async list(@Query('patientId') patientId: string, @Req() req: AuthenticatedRequest) {
    return this.linkedGps.listForPatient(patientId, authHeader(req));
  }

  @Post(':id/revoke')
  async revoke(@Param('id') id: string, @Body() body: DecisionReasonDto, @Req() req: AuthenticatedRequest) {
    return this.linkedGps.revoke(id, body.reason, authHeader(req));
  }
}
