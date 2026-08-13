import { ForbiddenException } from '@nestjs/common';
import { AuditLogQueryController } from './audit-log-query.controller';
import type { AuthenticatedRequest } from '../common/authenticated-request';

function staffRequest(): AuthenticatedRequest {
  return { headers: {}, auth: { sub: 'staff-1', principalType: 'internal_staff', roles: [], raw: {} } } as unknown as AuthenticatedRequest;
}

function gpRequest(): AuthenticatedRequest {
  return { headers: {}, auth: { sub: 'gp-1', principalType: 'gp', roles: [], raw: {} } } as unknown as AuthenticatedRequest;
}

describe('AuditLogQueryController', () => {
  it('lists audit events for a subject via the audit-client', async () => {
    const listForSubject = jest.fn(async () => [{ id: 'evt-1' }]);
    const controller = new AuditLogQueryController({ listForSubject } as any);

    const result = await controller.listForSubject({ subjectType: 'Referral', subjectId: 'ref-1' }, staffRequest());

    expect(listForSubject).toHaveBeenCalledWith('Referral', 'ref-1');
    expect(result).toEqual([{ id: 'evt-1' }]);
  });

  it('fetches a single event by id', async () => {
    const getEvent = jest.fn(async () => ({ id: 'evt-1', type: 'consent.granted' }));
    const controller = new AuditLogQueryController({ getEvent } as any);

    const result = await controller.getById('evt-1', staffRequest());

    expect(getEvent).toHaveBeenCalledWith('evt-1');
    expect(result).toEqual({ id: 'evt-1', type: 'consent.granted' });
  });

  it('independently verifies an entry rather than trusting a cached status', async () => {
    const verify = jest.fn(async () => ({ eventId: 'evt-1', valid: true, immudbTxId: 'tx-1', verifiedAt: 'now' }));
    const controller = new AuditLogQueryController({ verify } as any);

    const result = await controller.verify('evt-1', staffRequest());

    expect(verify).toHaveBeenCalledWith('evt-1');
    expect(result.valid).toBe(true);
  });

  it('rejects a non-staff caller before ever calling the audit-client', async () => {
    const getEvent = jest.fn();
    const controller = new AuditLogQueryController({ getEvent } as any);

    await expect(controller.getById('evt-1', gpRequest())).rejects.toBeInstanceOf(ForbiddenException);
    expect(getEvent).not.toHaveBeenCalled();
  });
});
