import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsOptional, IsString } from 'class-validator';
import { BearerAuthGuard } from '../common/bearer-auth.guard';
import { authHeader, requireStaff } from '../common/staff';
import { assertStepUp } from '../common/step-up';
import type { AuthenticatedRequest } from '../common/authenticated-request';
import { ConsentSecurityClient } from '../common/consent-security.client';

class DecisionDto {
  @IsOptional()
  @IsString()
  decisionNote?: string;
}

/**
 * ui-design.md Admin/Ops Console screen 2 — deceased-patient
 * executor/family/coroner access-request review. This is deliberately a
 * thin, real HTTP proxy over consent-security's own complete workflow
 * (services/consent-security/src/deceased/access-requests.*), not a
 * reimplementation — see common/consent-security.client.ts's doc comment
 * for why: consent-security already owns this data and its own
 * staff/step-up guards, which this console must not duplicate or
 * second-guess with a locally-cached copy that could drift.
 *
 * This controller still runs its own `requireStaff`/`assertStepUp` checks
 * before forwarding — defense in depth (reject obviously-unauthorised
 * callers at this console's own edge rather than relying solely on the
 * downstream service), not a substitute for consent-security's own
 * enforcement, which still applies unchanged to the forwarded request.
 */
@Controller('deceased-access-requests')
@UseGuards(BearerAuthGuard)
export class DeceasedAccessRequestsController {
  constructor(
    private readonly consentSecurity: ConsentSecurityClient,
    private readonly config: ConfigService,
  ) {}

  @Get('pending')
  async pending(@Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return this.consentSecurity.listPending(authHeader(req));
  }

  @Get('by-patient/:patientId')
  async listForPatient(@Param('patientId') patientId: string, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return this.consentSecurity.listForPatient(patientId, authHeader(req));
  }

  @Get(':id')
  async getById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return this.consentSecurity.getById(id, authHeader(req));
  }

  /**
   * Step-up gated at this console's own edge too — root CONVENTIONS.md §8
   * names "granting deceased-patient access" as the worked example.
   * consent-security enforces its own STEP_UP_ACR check on the forwarded
   * request independently; this is not a substitute for that.
   */
  @Post(':id/approve')
  async approve(@Param('id') id: string, @Body() dto: DecisionDto, @Req() req: AuthenticatedRequest) {
    const principal = requireStaff(req);
    assertStepUp(principal!, this.config.get<string>('STEP_UP_ACR', 'passkey'));
    return this.consentSecurity.approve(id, dto.decisionNote, authHeader(req));
  }

  @Post(':id/deny')
  async deny(@Param('id') id: string, @Body() dto: DecisionDto, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return this.consentSecurity.deny(id, dto.decisionNote, authHeader(req));
  }
}
