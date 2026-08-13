import { ForbiddenException } from '@nestjs/common';
import { DeceasedAccessRequestsController } from './deceased-access-requests.controller';
import type { ConsentSecurityClient } from '../common/consent-security.client';
import type { AuthenticatedRequest } from '../common/authenticated-request';

function fakeConfig(value = 'passkey') {
  return { get: () => value } as any;
}

function staffRequest(overrides: Partial<AuthenticatedRequest['auth']> = {}): AuthenticatedRequest {
  return {
    headers: { authorization: 'Bearer staff-token' },
    auth: { sub: 'staff-1', principalType: 'internal_staff', roles: [], raw: { acr: 'passkey', amr: [] }, ...overrides },
  } as unknown as AuthenticatedRequest;
}

describe('DeceasedAccessRequestsController', () => {
  it('forwards the caller bearer token unchanged to consent-security for listPending', async () => {
    const calls: unknown[] = [];
    const client = {
      listPending: async (auth: string) => {
        calls.push(auth);
        return [{ id: 'ar-1', status: 'pending' }];
      },
    } as unknown as ConsentSecurityClient;

    const controller = new DeceasedAccessRequestsController(client, fakeConfig());
    const result = await controller.pending(staffRequest());

    expect(calls).toEqual(['Bearer staff-token']);
    expect(result).toEqual([{ id: 'ar-1', status: 'pending' }]);
  });

  it('rejects a non-staff caller before ever calling consent-security', async () => {
    const client = { listPending: jest.fn() } as unknown as ConsentSecurityClient;
    const controller = new DeceasedAccessRequestsController(client, fakeConfig());
    const req = { headers: {}, auth: { sub: 'gp-1', principalType: 'gp', roles: [], raw: {} } } as unknown as AuthenticatedRequest;

    await expect(controller.pending(req)).rejects.toBeInstanceOf(ForbiddenException);
    expect((client.listPending as jest.Mock).mock.calls.length).toBe(0);
  });

  it('requires step-up before forwarding an approve call', async () => {
    const approve = jest.fn();
    const client = { approve } as unknown as ConsentSecurityClient;
    const controller = new DeceasedAccessRequestsController(client, fakeConfig());
    const req = staffRequest({ raw: { acr: 'password', amr: [] } } as any);

    await expect(controller.approve('ar-1', {}, req)).rejects.toBeInstanceOf(ForbiddenException);
    expect(approve).not.toHaveBeenCalled();
  });

  it('forwards an approve call once step-up is satisfied', async () => {
    const approve = jest.fn(async () => ({ id: 'ar-1', status: 'approved' }));
    const client = { approve } as unknown as ConsentSecurityClient;
    const controller = new DeceasedAccessRequestsController(client, fakeConfig());

    const result = await controller.approve('ar-1', { decisionNote: 'Grant of probate sighted' }, staffRequest());

    expect(approve).toHaveBeenCalledWith('ar-1', 'Grant of probate sighted', 'Bearer staff-token');
    expect(result).toEqual({ id: 'ar-1', status: 'approved' });
  });
});
