import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { ConsentRecordsService } from './consent-records.service';
import { CreateConsentRecordDto } from './dto/create-consent-record.dto';
import { ListConsentRecordsQueryDto } from './dto/list-consent-records.query.dto';
import { ReferralVisibilityDto } from './dto/referral-visibility.dto';
import { BearerAuthGuard } from '../common/bearer-auth.guard';
import type { AuthenticatedRequest } from '../common/authenticated-request';

function actorFrom(req: AuthenticatedRequest): ActorRef {
  if (!req.auth) {
    throw new UnauthorizedException('Authentication required');
  }
  const p = req.auth;
  return {
    principalType: p.principalType,
    id: p.sub,
    healthcareIdentifier: p.healthcareIdentifier as any,
    displayName: p.preferredUsername,
  };
}

/** The consent page's write/read API — see BUILD_LOG/consent-security.md. */
@Controller('consent-records')
@UseGuards(BearerAuthGuard)
export class ConsentRecordsController {
  constructor(private readonly consentRecords: ConsentRecordsService) {}

  @Post()
  async grant(@Body() dto: CreateConsentRecordDto, @Req() req: AuthenticatedRequest) {
    return this.consentRecords.grant(dto, actorFrom(req));
  }

  @Post(':id/revoke')
  async revoke(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.consentRecords.revoke(id, actorFrom(req));
  }

  @Get()
  async list(@Query() query: ListConsentRecordsQueryDto) {
    return this.consentRecords.listForPatient(query.patientId, query.subjectType);
  }
}

/**
 * Per-referral visibility — kept as a separate controller/route prefix
 * (`/consent/referral-visibility`) rather than folded into
 * `/consent-records` so callers (Referral Service, specialist/GP portals)
 * never need to know the composite subjectId convention documented in
 * consent-subject-type.ts.
 */
@Controller('consent/referral-visibility')
@UseGuards(BearerAuthGuard)
export class ReferralVisibilityController {
  constructor(private readonly consentRecords: ConsentRecordsService) {}

  @Post()
  async grant(@Body() dto: ReferralVisibilityDto, @Req() req: AuthenticatedRequest) {
    return this.consentRecords.grantReferralVisibility(dto.patientId, dto.referralId, dto.granteeId, actorFrom(req));
  }

  @Post('revoke')
  async revoke(@Body() dto: ReferralVisibilityDto, @Req() req: AuthenticatedRequest) {
    return this.consentRecords.revokeReferralVisibility(dto.patientId, dto.referralId, dto.granteeId, actorFrom(req));
  }

  @Get()
  async list(@Query('patientId') patientId: string, @Query('referralId') referralId: string) {
    return this.consentRecords.listReferralVisibility(patientId, referralId);
  }

  @Get('check')
  async check(
    @Query('patientId') patientId: string,
    @Query('referralId') referralId: string,
    @Query('granteeId') granteeId: string,
  ) {
    return this.consentRecords.checkReferralVisibility(patientId, referralId, granteeId);
  }
}
