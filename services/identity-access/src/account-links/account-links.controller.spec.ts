import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@referralplatform/auth-client';
import { AccountLinksController } from './account-links.controller';
import { AccountLinksService } from './account-links.service';
import type { AuthenticatedRequest } from '../common/authenticated-request';
import { CreateLinkUrlDto } from './dto/create-link-url.dto';

const patient: AuthenticatedPrincipal = { sub: 'patient-1', principalType: 'patient', roles: [], raw: {} };

function makeController(overrides: Partial<AccountLinksService> = {}) {
  return new AccountLinksController(overrides as AccountLinksService);
}

describe('AccountLinksController', () => {
  it('requires an authenticated session for every route — the load-bearing constraint', async () => {
    const controller = makeController();
    const req = {} as AuthenticatedRequest;
    const dto: CreateLinkUrlDto = { clientId: 'patient-web', redirectUri: 'http://localhost:3102/cb', sessionId: 's' };

    await expect(controller.list(req)).rejects.toThrow(UnauthorizedException);
    await expect(controller.createLinkUrl(req, 'google', dto)).rejects.toThrow(UnauthorizedException);
    await expect(controller.unlink(req, 'google')).rejects.toThrow(UnauthorizedException);
  });

  it("delegates link-url creation with the caller's own principal, never a client-supplied one", async () => {
    const createLinkUrl = jest.fn().mockResolvedValue({ linkUrl: 'https://x', expiresAt: 'now' });
    const controller = makeController({ createLinkUrl });
    const req = { auth: patient } as AuthenticatedRequest;
    const dto: CreateLinkUrlDto = {
      clientId: 'patient-web',
      redirectUri: 'http://localhost:3102/cb',
      sessionId: 'sid-1',
    };

    await controller.createLinkUrl(req, 'google', dto);

    expect(createLinkUrl).toHaveBeenCalledWith(patient, 'google', 'patient-web', 'http://localhost:3102/cb', 'sid-1');
  });
});
