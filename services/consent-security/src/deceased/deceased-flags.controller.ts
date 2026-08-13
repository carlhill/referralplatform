import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { DeceasedFlagsService } from './deceased-flags.service';
import { FlagDeceasedDto } from './dto/flag-deceased.dto';
import { BearerAuthGuard } from '../common/bearer-auth.guard';
import type { AuthenticatedRequest } from '../common/authenticated-request';

function actorFrom(req: AuthenticatedRequest): ActorRef {
  if (!req.auth) {
    throw new UnauthorizedException('Authentication required');
  }
  return { principalType: req.auth.principalType, id: req.auth.sub, displayName: req.auth.preferredUsername };
}

/** The GP-triggered deceased-patient flag/freeze workflow — see deceased-flags.service.ts. */
@Controller('deceased-flags')
@UseGuards(BearerAuthGuard)
export class DeceasedFlagsController {
  constructor(private readonly deceasedFlags: DeceasedFlagsService) {}

  @Post()
  async flag(@Body() dto: FlagDeceasedDto, @Req() req: AuthenticatedRequest) {
    const principal = req.auth!;
    if (
      principal.principalType !== 'gp' &&
      principal.principalType !== 'internal_staff' &&
      principal.principalType !== 'system'
    ) {
      throw new ForbiddenException(
        'Only a GP (the natural first-notice point), internal staff, or a system principal may flag a patient deceased',
      );
    }
    return this.deceasedFlags.flag(dto, actorFrom(req));
  }

  @Get(':patientId')
  async getActiveFlag(@Param('patientId') patientId: string) {
    return this.deceasedFlags.getActiveFlag(patientId);
  }
}
