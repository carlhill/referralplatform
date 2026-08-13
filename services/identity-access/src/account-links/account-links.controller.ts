import { Body, Controller, Delete, Get, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { AccountLinksService } from './account-links.service';
import { CreateLinkUrlDto } from './dto/create-link-url.dto';
import type { AuthenticatedRequest } from '../common/authenticated-request';

/**
 * Secondary sign-in linking (Google/Microsoft) — every route here requires
 * an already-authenticated caller (requireAuth middleware, see
 * app.module.ts). This is the one property that makes the "social login
 * never creates or activates an account" constraint real: there is no route
 * in this controller — or anywhere else in this service — that accepts a
 * Google/Microsoft OAuth callback for an *unauthenticated* request. See
 * account-links.service.ts for the full mechanism.
 */
@Controller('account/social-links')
export class AccountLinksController {
  constructor(private readonly accountLinks: AccountLinksService) {}

  private principal(req: AuthenticatedRequest) {
    if (!req.auth) {
      throw new UnauthorizedException('Authentication required');
    }
    return req.auth;
  }

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    return this.accountLinks.list(this.principal(req));
  }

  @Post(':provider/link-url')
  async createLinkUrl(
    @Req() req: AuthenticatedRequest,
    @Param('provider') provider: string,
    @Body() body: CreateLinkUrlDto,
  ) {
    return this.accountLinks.createLinkUrl(
      this.principal(req),
      provider,
      body.clientId,
      body.redirectUri,
      body.sessionId,
    );
  }

  @Delete(':provider')
  async unlink(@Req() req: AuthenticatedRequest, @Param('provider') provider: string) {
    await this.accountLinks.unlink(this.principal(req), provider);
    return { unlinked: true };
  }
}
