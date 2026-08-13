import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ActorRef } from '@referralplatform/shared-types';
import { GpLinksService } from './gp-links.service';
import { CreateGpLinkDto } from './dto/create-gp-link.dto';
import { DecisionReasonDto } from './dto/decision.dto';
import { ListGpLinksQueryDto } from './dto/list-gp-links.query.dto';
import { BearerAuthGuard } from '../common/bearer-auth.guard';
import { HpioNashAuthGuard } from '../common/hpio-nash.guard';
import { assertStepUp } from '../common/step-up';
import type { AuthenticatedRequest } from '../common/authenticated-request';

/**
 * GP Authorisation Service HTTP API — module 1B of business-process-flow.md.
 * See BUILD_LOG/gp-authorisation.md for the full endpoint list and design
 * rationale.
 */
@Controller('gp-links')
export class GpLinksController {
  constructor(
    private readonly gpLinks: GpLinksService,
    private readonly config: ConfigService,
  ) {}

  private principal(req: AuthenticatedRequest) {
    if (!req.auth) {
      throw new UnauthorizedException('Authentication required');
    }
    return req.auth;
  }

  private actorFrom(req: AuthenticatedRequest): ActorRef {
    const p = this.principal(req);
    return {
      principalType: p.principalType,
      id: p.sub,
      healthcareIdentifier: p.healthcareIdentifier as any,
      displayName: p.preferredUsername,
    };
  }

  /** Called by an HPI-O/NASH-authenticated practice system — see HpioNashAuthGuard. */
  @Post()
  @UseGuards(HpioNashAuthGuard)
  async create(@Body() dto: CreateGpLinkDto, @Req() req: AuthenticatedRequest) {
    return this.gpLinks.requestLink(dto, this.actorFrom(req));
  }

  @Get()
  @UseGuards(BearerAuthGuard)
  async list(@Query() query: ListGpLinksQueryDto) {
    if (query.patientId) {
      return this.gpLinks.listForPatient(query.patientId, query.status);
    }
    if (query.gpId) {
      return this.gpLinks.listForGp(query.gpId, query.status);
    }
    return [];
  }

  /**
   * The enforcement point other services (Referral Service, in particular)
   * call before creating a referral for a GP not already known to be
   * linked — "block referral creation until approved," per
   * claude/modules-and-requirements.md's GP Authorisation requirements.
   */
  @Get('authorisation')
  @UseGuards(BearerAuthGuard)
  async authorisation(@Query('patientId') patientId: string, @Query('gpId') gpId: string) {
    return this.gpLinks.checkAuthorisation(patientId, gpId);
  }

  @Get(':id')
  @UseGuards(BearerAuthGuard)
  async getById(@Param('id') id: string) {
    return this.gpLinks.getById(id);
  }

  /**
   * Patient/carer push-approval action — step-up gated per root
   * CONVENTIONS.md §8, which names "approving a new GP link" as a worked
   * example of a step-up-required action.
   */
  @Post(':id/approve')
  @UseGuards(BearerAuthGuard)
  async approve(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const principal = this.principal(req);
    if (
      principal.principalType !== 'patient' &&
      principal.principalType !== 'carer' &&
      principal.principalType !== 'internal_staff'
    ) {
      throw new ForbiddenException('Only the patient, their carer/delegate, or internal staff may approve a GP link');
    }
    assertStepUp(principal, this.config.get<string>('STEP_UP_ACR', 'passkey'));
    return this.gpLinks.approve(id, this.actorFrom(req));
  }

  @Post(':id/decline')
  @UseGuards(BearerAuthGuard)
  async decline(@Param('id') id: string, @Body() body: DecisionReasonDto, @Req() req: AuthenticatedRequest) {
    const principal = this.principal(req);
    if (
      principal.principalType !== 'patient' &&
      principal.principalType !== 'carer' &&
      principal.principalType !== 'internal_staff'
    ) {
      throw new ForbiddenException('Only the patient, their carer/delegate, or internal staff may decline a GP link');
    }
    return this.gpLinks.decline(id, this.actorFrom(req), body.reason);
  }

  /** The "linked GPs and practices — revoke" control on the consent page (module 7). */
  @Post(':id/revoke')
  @UseGuards(BearerAuthGuard)
  async revoke(@Param('id') id: string, @Body() body: DecisionReasonDto, @Req() req: AuthenticatedRequest) {
    const principal = this.principal(req);
    if (
      principal.principalType !== 'patient' &&
      principal.principalType !== 'carer' &&
      principal.principalType !== 'internal_staff'
    ) {
      throw new ForbiddenException('Only the patient, their carer/delegate, or internal staff may revoke a GP link');
    }
    return this.gpLinks.revoke(id, this.actorFrom(req), body.reason);
  }
}
