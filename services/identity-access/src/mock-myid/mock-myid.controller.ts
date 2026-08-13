import { Body, Controller, Get, Headers, Post, Query, Redirect, UnauthorizedException } from '@nestjs/common';
import { MockMyIdService } from './mock-myid.service';
import { TokenRequestDto } from './dto/token-request.dto';

/**
 * MOCK — replace with real integration.
 *
 * Deliberately unauthenticated (like /health — see health.controller.ts):
 * Keycloak itself is the caller of every route in this controller, acting as
 * the OIDC relying party against this stub IdP, exactly as it would against
 * the real myID issuer. None of these routes accept or verify a
 * ReferralPlatform bearer token — that would conflate "is this Keycloak
 * broker request legitimate" with "is this ReferralPlatform user
 * authenticated", which are different questions the real myID integration
 * won't conflate either.
 */
@Controller('mock-myid')
export class MockMyIdController {
  constructor(private readonly mockMyId: MockMyIdService) {}

  @Get('.well-known/openid-configuration')
  discovery() {
    return this.mockMyId.discoveryDocument();
  }

  @Get('jwks')
  async jwks() {
    return this.mockMyId.jwks();
  }

  @Get('authorize')
  @Redirect()
  authorize(
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('response_type') responseType: string,
    @Query('state') state?: string,
    @Query('nonce') nonce?: string,
    @Query('login_hint') loginHint?: string,
  ) {
    const { code, state: echoedState } = this.mockMyId.createAuthorizationCode({
      clientId,
      redirectUri,
      responseType,
      state,
      nonce,
      loginHint,
    });
    const url = new URL(redirectUri);
    url.searchParams.set('code', code);
    if (echoedState !== undefined) {
      url.searchParams.set('state', echoedState);
    }
    return { url: url.toString(), statusCode: 302 };
  }

  @Post('token')
  async token(@Body() body: TokenRequestDto) {
    return this.mockMyId.exchangeCodeForTokens({
      grantType: body.grant_type,
      code: body.code,
      redirectUri: body.redirect_uri,
      clientId: body.client_id,
      clientSecret: body.client_secret,
    });
  }

  @Get('userinfo')
  userinfo(@Headers('authorization') authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    return this.mockMyId.userinfo(authorization.slice('Bearer '.length));
  }
}
