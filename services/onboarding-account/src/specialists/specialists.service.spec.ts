import { ConflictException, NotFoundException } from '@nestjs/common';
import { SpecialistsService } from './specialists.service';

function makePrismaMock() {
  const state: Record<string, any> = {};
  const prisma: any = {
    specialist: {
      findUnique: jest.fn(),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: 'spec_1', ...data };
        state.row = row;
        return row;
      }),
      update: jest.fn(async ({ data }: any) => {
        state.row = { ...state.row, ...data };
        return state.row;
      }),
    },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
  };
  return prisma;
}

function makeAuditOutboxMock() {
  return { enqueue: jest.fn(), enqueueStandalone: jest.fn() } as any;
}

const dto = {
  givenName: 'Alex',
  familyName: 'Smith',
  contactEmail: 'alex@example.com',
  ahpraNumber: 'MED0001234567',
};

describe('SpecialistsService.register', () => {
  it('rejects a duplicate AHPRA number', async () => {
    const prisma = makePrismaMock();
    prisma.specialist.findUnique.mockResolvedValue({ id: 'existing' });
    const service = new SpecialistsService(prisma, makeAuditOutboxMock(), {} as any, {} as any, {} as any, {} as any);

    await expect(service.register(dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('stops after a failed AHPRA verification without attempting HPI-I/NASH/directory steps', async () => {
    const prisma = makePrismaMock();
    prisma.specialist.findUnique.mockResolvedValue(null);
    const ahpra = { verifyRegistration: jest.fn().mockResolvedValue({ verified: false, reason: 'not registered' }) };
    const hiService = { resolveHpii: jest.fn() };
    const nash = { provision: jest.fn() };
    const directory = { createProfile: jest.fn() };

    const service = new SpecialistsService(
      prisma,
      makeAuditOutboxMock(),
      ahpra as any,
      hiService as any,
      nash as any,
      directory as any,
    );
    const result = await service.register(dto);

    expect(result.ahpraVerificationStatus).toBe('failed');
    expect(hiService.resolveHpii).not.toHaveBeenCalled();
    expect(nash.provision).not.toHaveBeenCalled();
    expect(directory.createProfile).not.toHaveBeenCalled();
  });

  it('runs the full chain (AHPRA -> HPI-I -> NASH -> directory) on success', async () => {
    const prisma = makePrismaMock();
    prisma.specialist.findUnique.mockResolvedValue(null);
    const ahpra = {
      verifyRegistration: jest
        .fn()
        .mockResolvedValue({ verified: true, registrationStatus: 'Registered', specialty: 'Cardiology' }),
    };
    const hiService = { resolveHpii: jest.fn().mockResolvedValue({ hpiI: '8003611234567890', resolved: true }) };
    const nash = {
      provision: jest.fn().mockResolvedValue({ nashCredentialId: 'nash-1', status: 'issued', issuedAt: 'now' }),
    };
    const directory = { createProfile: jest.fn().mockResolvedValue({ created: true, directoryProfileId: 'dir-1' }) };

    const service = new SpecialistsService(
      prisma,
      makeAuditOutboxMock(),
      ahpra as any,
      hiService as any,
      nash as any,
      directory as any,
    );
    const result = await service.register(dto);

    expect(result.ahpraVerificationStatus).toBe('verified');
    expect(result.hpiIResolutionStatus).toBe('resolved');
    expect(result.nashCredentialStatus).toBe('issued');
    expect(result.directoryProfileStatus).toBe('created');
    expect(directory.createProfile).toHaveBeenCalledWith(expect.objectContaining({ hpiI: '8003611234567890' }));
  });

  it('records pending_directory_service (not a failure) when the Directory Service call does not succeed', async () => {
    const prisma = makePrismaMock();
    prisma.specialist.findUnique.mockResolvedValue(null);
    const ahpra = { verifyRegistration: jest.fn().mockResolvedValue({ verified: true, specialty: 'Cardiology' }) };
    const hiService = { resolveHpii: jest.fn().mockResolvedValue({ hpiI: '8003611234567890', resolved: true }) };
    const nash = { provision: jest.fn().mockResolvedValue({ nashCredentialId: 'nash-1', status: 'issued' }) };
    const directory = { createProfile: jest.fn().mockResolvedValue({ created: false, reason: 'ECONNREFUSED' }) };

    const service = new SpecialistsService(
      prisma,
      makeAuditOutboxMock(),
      ahpra as any,
      hiService as any,
      nash as any,
      directory as any,
    );
    const result = await service.register(dto);

    expect(result.directoryProfileStatus).toBe('pending_directory_service');
  });
});

describe('SpecialistsService.setEconsultOptIn', () => {
  it('404s for an unknown specialist', async () => {
    const prisma = makePrismaMock();
    prisma.specialist.findUnique.mockResolvedValue(null);
    const service = new SpecialistsService(prisma, makeAuditOutboxMock(), {} as any, {} as any, {} as any, {} as any);

    await expect(service.setEconsultOptIn('missing', true)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates the opt-in flag and timestamp', async () => {
    const prisma = makePrismaMock();
    prisma.specialist.findUnique.mockResolvedValue({ id: 'spec_1' });
    const auditOutbox = makeAuditOutboxMock();
    const service = new SpecialistsService(prisma, auditOutbox, {} as any, {} as any, {} as any, {} as any);

    const result = await service.setEconsultOptIn('spec_1', true);

    expect(result.econsultOptIn).toBe(true);
    expect(auditOutbox.enqueue).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ type: 'specialist.econsult_opt_in_changed', payload: { optIn: true } }),
    );
  });
});
