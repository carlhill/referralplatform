import { Body, Controller, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { MessageThreadService } from './message-thread.service';
import { CreateThreadDto } from './dto/create-thread.dto';
import { PostMessageDto } from './dto/post-message.dto';
import { AddParticipantDto } from './dto/add-participant.dto';
import { ResolveThreadDto } from './dto/resolve-thread.dto';
import { BearerAuthGuard } from '../common/bearer-auth.guard';
import type { AuthenticatedRequest } from '../common/authenticated-request';

function actorFrom(req: AuthenticatedRequest): ActorRef {
  if (!req.auth) throw new UnauthorizedException('Authentication required');
  return {
    principalType: req.auth.principalType,
    id: req.auth.sub,
    healthcareIdentifier: req.auth.healthcareIdentifier as any,
    displayName: req.auth.preferredUsername,
  };
}

/**
 * The referral-scoped secure message thread API — module #13's second
 * bounded concern (minors-multigp-exception-paths.md). Creation/lookup is
 * naturally referral-scoped (`/referrals/:referralId/message-threads`);
 * everything else operates on the thread's own id once you have it
 * (`/message-threads/:id/...`) — mirroring how the Referral Service's own
 * controller is structured.
 */
@Controller('referrals/:referralId/message-threads')
@UseGuards(BearerAuthGuard)
export class ReferralMessageThreadController {
  constructor(private readonly threads: MessageThreadService) {}

  /** Get-or-create — idempotent, since a thread is lazily created on first use. */
  @Post()
  async createOrGet(
    @Param('referralId') referralId: string,
    @Body() dto: CreateThreadDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.threads.createOrGet(referralId, actorFrom(req), dto);
  }

  /** Returns 0 or 1 thread — kept as a list for API consistency/future extensibility. */
  @Get()
  async listForReferral(@Param('referralId') referralId: string) {
    const thread = await this.threads.getByReferralId(referralId);
    return thread ? [thread] : [];
  }
}

@Controller('message-threads')
@UseGuards(BearerAuthGuard)
export class MessageThreadByIdController {
  constructor(private readonly threads: MessageThreadService) {}

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.threads.getById(id);
  }

  @Get(':id/messages')
  async listMessages(@Param('id') id: string) {
    return this.threads.listMessages(id);
  }

  @Post(':id/messages')
  async postMessage(@Param('id') id: string, @Body() dto: PostMessageDto, @Req() req: AuthenticatedRequest) {
    return this.threads.postMessage(id, actorFrom(req), dto.body);
  }

  @Post(':id/participants')
  async addParticipant(@Param('id') id: string, @Body() dto: AddParticipantDto, @Req() req: AuthenticatedRequest) {
    return this.threads.addParticipant(id, actorFrom(req), dto);
  }

  @Post(':id/resolve')
  async resolve(@Param('id') id: string, @Body() dto: ResolveThreadDto, @Req() req: AuthenticatedRequest) {
    return this.threads.resolve(id, actorFrom(req), dto.note);
  }
}
