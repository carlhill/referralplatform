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
import type { ActorRef } from '@referralplatform/shared-types';
import { ReferralService } from './referral.service';
import { CreateReferralDto } from './dto/create-referral.dto';
import { DecisionReasonDto } from './dto/decision-reason.dto';
import { AcknowledgeFlagDto } from './dto/acknowledge-flag.dto';
import { ListReferralsQueryDto } from './dto/list-referrals.query.dto';
import { BearerAuthGuard } from '../common/bearer-auth.guard';
import type { AuthenticatedRequest } from '../common/authenticated-request';

/**
 * Referral Service HTTP API — module #5 of modules-and-requirements.md. See
 * BUILD_LOG/referral.md for the full endpoint list and design rationale.
 */
@Controller('referrals')
export class ReferralController {
  constructor(private readonly referrals: ReferralService) {}

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

  /** GP-initiated, or a GP-practice system acting on the GP's behalf. */
  @Post()
  @UseGuards(BearerAuthGuard)
  async create(@Body() dto: CreateReferralDto, @Req() req: AuthenticatedRequest) {
    const principal = this.principal(req);
    if (
      principal.principalType !== 'gp' &&
      principal.principalType !== 'system' &&
      principal.principalType !== 'internal_staff'
    ) {
      throw new ForbiddenException('Only a GP, GP-practice system, or internal staff may create a referral');
    }
    return this.referrals.create(dto, this.actorFrom(req));
  }

  @Get()
  @UseGuards(BearerAuthGuard)
  async list(@Query() query: ListReferralsQueryDto) {
    return this.referrals.list(query);
  }

  @Get(':id')
  @UseGuards(BearerAuthGuard)
  async getById(@Param('id') id: string) {
    return this.referrals.getById(id);
  }

  @Get(':id/compliance-flags')
  @UseGuards(BearerAuthGuard)
  async complianceFlags(@Param('id') id: string) {
    return this.referrals.getComplianceFlags(id);
  }

  @Post(':id/compliance-flags/:flagId/acknowledge')
  @UseGuards(BearerAuthGuard)
  async acknowledgeFlag(
    @Param('id') id: string,
    @Param('flagId') flagId: string,
    @Body() dto: AcknowledgeFlagDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.referrals.acknowledgeComplianceFlag(id, flagId, this.actorFrom(req), dto.note);
  }

  /**
   * Called by the Onboarding & Account Service once a patient's account
   * activation completes, to route every referral of theirs still sitting
   * in the 2-day queue — see ReferralService.activateQueuedForPatient's doc
   * comment for the current integration-gap caveat.
   */
  @Post('by-patient/:patientId/activate-queued')
  @UseGuards(BearerAuthGuard)
  async activateQueued(@Param('patientId') patientId: string, @Req() req: AuthenticatedRequest) {
    const principal = this.principal(req);
    if (principal.principalType !== 'system' && principal.principalType !== 'internal_staff') {
      throw new ForbiddenException(
        'Only a system principal (the Onboarding & Account Service) or internal staff may trigger this',
      );
    }
    const routed = await this.referrals.activateQueuedForPatient(patientId, this.actorFrom(req));
    return { routed };
  }

  /** Specialist declines the referral as inappropriate — module 4's explicit decline path with dual notification (Notification Service's job, not this one). */
  @Post(':id/decline')
  @UseGuards(BearerAuthGuard)
  async decline(@Param('id') id: string, @Body() body: DecisionReasonDto, @Req() req: AuthenticatedRequest) {
    const principal = this.principal(req);
    if (principal.principalType !== 'specialist' && principal.principalType !== 'internal_staff') {
      throw new ForbiddenException('Only the receiving specialist or internal staff may decline a referral');
    }
    return this.referrals.decline(id, this.actorFrom(req), body.reason);
  }

  /** Called by the Booking Service once a slot is confirmed. */
  @Post(':id/book')
  @UseGuards(BearerAuthGuard)
  async book(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const principal = this.principal(req);
    if (principal.principalType !== 'system' && principal.principalType !== 'internal_staff') {
      throw new ForbiddenException(
        'Only the Booking Service (system principal) or internal staff may confirm a booking',
      );
    }
    return this.referrals.book(id, this.actorFrom(req));
  }

  @Post(':id/review/start')
  @UseGuards(BearerAuthGuard)
  async startReview(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const principal = this.principal(req);
    if (principal.principalType !== 'specialist' && principal.principalType !== 'internal_staff') {
      throw new ForbiddenException('Only the receiving specialist or internal staff may start a review');
    }
    return this.referrals.startReview(id, this.actorFrom(req));
  }

  @Post(':id/review/resolve-econsult')
  @UseGuards(BearerAuthGuard)
  async resolveEconsult(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const principal = this.principal(req);
    if (principal.principalType !== 'specialist' && principal.principalType !== 'internal_staff') {
      throw new ForbiddenException('Only the receiving specialist or internal staff may resolve via eConsult');
    }
    return this.referrals.resolveEconsult(id, this.actorFrom(req));
  }

  @Post(':id/review/complete')
  @UseGuards(BearerAuthGuard)
  async complete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const principal = this.principal(req);
    if (principal.principalType !== 'specialist' && principal.principalType !== 'internal_staff') {
      throw new ForbiddenException('Only the receiving specialist or internal staff may complete a review');
    }
    return this.referrals.complete(id, this.actorFrom(req));
  }

  /** Patient/carer/GP-initiated cancellation — dual notification is Notification Service's job, not this one. */
  @Post(':id/cancel')
  @UseGuards(BearerAuthGuard)
  async cancel(@Param('id') id: string, @Body() body: DecisionReasonDto, @Req() req: AuthenticatedRequest) {
    const principal = this.principal(req);
    if (!['patient', 'carer', 'gp', 'internal_staff'].includes(principal.principalType)) {
      throw new ForbiddenException(
        'Only the patient, their carer/delegate, the referring GP, or internal staff may cancel a referral',
      );
    }
    return this.referrals.cancel(id, this.actorFrom(req), body.reason);
  }
}
