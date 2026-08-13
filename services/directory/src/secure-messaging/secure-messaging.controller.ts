import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { SecureMessagingService } from './secure-messaging.service';
import { RouteReferralDto } from './dto/route-referral.dto';
import { BearerAuthGuard } from '../common/bearer-auth.guard';
import type { AuthenticatedRequest } from '../common/authenticated-request';

/**
 * Secure Messaging Gateway HTTP API — module 8 of modules-and-requirements.md.
 * Called by the Referral Service once a referral is ready to send. See
 * BUILD_LOG/directory.md for the full endpoint list and design rationale.
 */
@Controller('secure-messaging')
@UseGuards(BearerAuthGuard)
export class SecureMessagingController {
  constructor(private readonly secureMessaging: SecureMessagingService) {}

  private actorFrom(req: AuthenticatedRequest): ActorRef {
    const p = req.auth;
    // BearerAuthGuard guarantees req.auth is set before a handler runs.
    return {
      principalType: p!.principalType,
      id: p!.sub,
      healthcareIdentifier: p!.healthcareIdentifier as any,
      displayName: p!.preferredUsername,
    };
  }

  @Post('route')
  async route(@Body() dto: RouteReferralDto, @Req() req: AuthenticatedRequest) {
    return this.secureMessaging.routeReferral(dto, this.actorFrom(req));
  }

  @Post('attempts/:id/retry')
  async retry(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.secureMessaging.retryAttempt(id, this.actorFrom(req));
  }

  @Get('attempts/:id')
  async getAttempt(@Param('id') id: string) {
    return this.secureMessaging.getAttempt(id);
  }

  @Get('attempts')
  async listForReferral(@Query('referralId') referralId: string) {
    return this.secureMessaging.listForReferral(referralId);
  }
}
