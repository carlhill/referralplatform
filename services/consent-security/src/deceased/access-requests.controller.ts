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
import { ConfigService } from '@nestjs/config';
import type { ActorRef } from '@referralplatform/shared-types';
import { AccessRequestsService } from './access-requests.service';
import { SubmitAccessRequestDto } from './dto/submit-access-request.dto';
import { AccessRequestDecisionDto } from './dto/decision.dto';
import { isEligibleByDefaultStateRule, type RequesterRelationship } from './state-eligibility';
import { BearerAuthGuard } from '../common/bearer-auth.guard';
import { assertStepUp } from '../common/step-up';
import type { AuthenticatedRequest } from '../common/authenticated-request';
import type { AustralianState } from '@referralplatform/shared-types';
import type { AccessRequestEntity } from './access-requests.service';

function actorFrom(req: AuthenticatedRequest): ActorRef {
  if (!req.auth) {
    throw new UnauthorizedException('Authentication required');
  }
  return { principalType: req.auth.principalType, id: req.auth.sub, displayName: req.auth.preferredUsername };
}

function requireStaff(req: AuthenticatedRequest): void {
  if (req.auth?.principalType !== 'internal_staff') {
    throw new ForbiddenException('Only internal staff may review a deceased-patient access request');
  }
}

/** Attaches the decision-support-only eligibility hint — see state-eligibility.ts. */
function withEligibilityHint(request: AccessRequestEntity) {
  return {
    ...request,
    eligibleByDefaultStateRule: isEligibleByDefaultStateRule(
      request.state as AustralianState,
      request.requesterRelationship as RequesterRelationship,
    ),
  };
}

/**
 * The human-reviewed executor/administrator/immediate-family/coroner access
 * queue — see access-requests.service.ts. `GET /deceased-flags/:patientId/
 * access-requests` and `POST .../access-requests` are nested under
 * DeceasedFlagsController's path prefix conceptually but registered here to
 * keep this controller focused on the access-request lifecycle.
 */
@Controller()
@UseGuards(BearerAuthGuard)
export class AccessRequestsController {
  constructor(
    private readonly accessRequests: AccessRequestsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Known gap (see BUILD_LOG/consent-security.md): a real executor/family/
   * coroner requester may not hold a ReferralPlatform account at all, so
   * this endpoint being bearer-token-gated assumes staff-assisted intake for
   * now (a staff member submits on the requester's behalf after an
   * out-of-band conversation) rather than genuine self-service by the
   * requester — that's consistent with "never self-service" but the intake
   * *channel* still needs a real design (a public form + staff triage,
   * most likely) before this is patient/family-facing.
   */
  @Post('deceased-flags/:patientId/access-requests')
  async submit(@Param('patientId') patientId: string, @Body() dto: SubmitAccessRequestDto) {
    const request = await this.accessRequests.submit(patientId, dto);
    return withEligibilityHint(request);
  }

  @Get('deceased-flags/:patientId/access-requests')
  async listForPatient(@Param('patientId') patientId: string, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    const requests = await this.accessRequests.listForPatient(patientId);
    return requests.map(withEligibilityHint);
  }

  @Get('access-requests/pending')
  async pending(@Req() req: AuthenticatedRequest) {
    requireStaff(req);
    const requests = await this.accessRequests.listPending();
    return requests.map(withEligibilityHint);
  }

  @Get('access-requests/:id')
  async getById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return withEligibilityHint(await this.accessRequests.getById(id));
  }

  /**
   * Step-up gated — root CONVENTIONS.md §8 names "granting deceased-patient
   * access" as a worked example of a step-up-required action.
   */
  @Post('access-requests/:id/approve')
  async approve(@Param('id') id: string, @Body() dto: AccessRequestDecisionDto, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    assertStepUp(req.auth!, this.config.get<string>('STEP_UP_ACR', 'passkey'));
    return this.accessRequests.approve(id, actorFrom(req), dto.decisionNote);
  }

  @Post('access-requests/:id/deny')
  async deny(@Param('id') id: string, @Body() dto: AccessRequestDecisionDto, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return this.accessRequests.deny(id, actorFrom(req), dto.decisionNote);
  }
}
