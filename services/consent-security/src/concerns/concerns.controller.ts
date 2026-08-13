import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { ConcernsService } from './concerns.service';
import { RaiseConcernDto } from './dto/raise-concern.dto';
import { ResolveConcernDto } from './dto/resolve-concern.dto';
import { BearerAuthGuard } from '../common/bearer-auth.guard';
import type { AuthenticatedRequest } from '../common/authenticated-request';

function actorFrom(req: AuthenticatedRequest): ActorRef {
  if (!req.auth) {
    throw new UnauthorizedException('Authentication required');
  }
  return { principalType: req.auth.principalType, id: req.auth.sub, displayName: req.auth.preferredUsername };
}

/** The "raise a concern" API — see BUILD_LOG/consent-security.md and triage.ts. */
@Controller('concerns')
@UseGuards(BearerAuthGuard)
export class ConcernsController {
  constructor(private readonly concerns: ConcernsService) {}

  @Post()
  async raise(@Body() dto: RaiseConcernDto, @Req() req: AuthenticatedRequest) {
    return this.concerns.raise(dto, actorFrom(req));
  }

  @Get()
  async list(@Query('patientId') patientId: string, @Query('status') status?: string) {
    return this.concerns.listForPatient(patientId, status);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.concerns.getById(id);
  }

  @Post(':id/resolve')
  async resolve(@Param('id') id: string, @Body() dto: ResolveConcernDto, @Req() req: AuthenticatedRequest) {
    return this.concerns.resolve(id, dto.resolutionNote, actorFrom(req));
  }

  @Post(':id/escalate-to-oaic')
  async escalate(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.concerns.escalateToOaic(id, actorFrom(req));
  }
}
