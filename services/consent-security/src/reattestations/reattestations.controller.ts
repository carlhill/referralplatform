import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { ReattestationsService } from './reattestations.service';
import { ScheduleReattestationDto } from './dto/schedule-reattestation.dto';
import { BearerAuthGuard } from '../common/bearer-auth.guard';
import type { AuthenticatedRequest } from '../common/authenticated-request';

@Controller('reattestations')
@UseGuards(BearerAuthGuard)
export class ReattestationsController {
  constructor(private readonly reattestations: ReattestationsService) {}

  @Post()
  async schedule(@Body() dto: ScheduleReattestationDto) {
    return this.reattestations.schedule(dto);
  }

  @Get('due')
  async due(@Query('asOf') asOf?: string) {
    return this.reattestations.listDue(asOf ? new Date(asOf) : undefined);
  }

  @Get()
  async listForPatient(@Query('patientId') patientId: string) {
    return this.reattestations.listForPatient(patientId);
  }

  @Post(':id/attest')
  async attest(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const actor: ActorRef = { principalType: req.auth!.principalType, id: req.auth!.sub };
    return this.reattestations.attest(id, actor);
  }
}
