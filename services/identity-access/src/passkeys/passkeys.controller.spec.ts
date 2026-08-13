import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@referralplatform/auth-client';
import { PasskeysController } from './passkeys.controller';
import { PasskeysService } from './passkeys.service';
import type { AuthenticatedRequest } from '../common/authenticated-request';

const clinicianStepUp: AuthenticatedPrincipal = {
  sub: 'user-1',
  principalType: 'gp',
  roles: ['gp'],
  raw: { amr: ['webauthn'] },
};

function makeController(passkeys: Partial<PasskeysService> = {}) {
  const config = { get: () => 'passkey' } as unknown as ConfigService;
  return new PasskeysController(passkeys as PasskeysService, config);
}

describe('PasskeysController', () => {
  it('throws UnauthorizedException if req.auth was never populated (middleware not wired)', async () => {
    const controller = makeController();
    const req = {} as AuthenticatedRequest;
    await expect(controller.list(req)).rejects.toThrow(UnauthorizedException);
  });

  it('delegates listing to PasskeysService, scoped to req.auth', async () => {
    const list = jest.fn().mockResolvedValue([]);
    const controller = makeController({ list });
    const req = { auth: clinicianStepUp } as AuthenticatedRequest;

    await controller.list(req);

    expect(list).toHaveBeenCalledWith(clinicianStepUp);
  });

  it('rejects revocation without a step-up (webauthn/hwk) amr claim', async () => {
    const revoke = jest.fn();
    const controller = makeController({ revoke });
    const req = { auth: { ...clinicianStepUp, raw: {} } } as AuthenticatedRequest;

    await expect(controller.revoke(req, 'cred-1')).rejects.toThrow(/step-up/i);
    expect(revoke).not.toHaveBeenCalled();
  });

  it('allows revocation with a step-up amr claim present', async () => {
    const revoke = jest.fn().mockResolvedValue(undefined);
    const controller = makeController({ revoke });
    const req = { auth: clinicianStepUp } as AuthenticatedRequest;

    const result = await controller.revoke(req, 'cred-1');

    expect(revoke).toHaveBeenCalledWith(clinicianStepUp, 'cred-1');
    expect(result).toEqual({ revoked: true });
  });
});
