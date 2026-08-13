import { ConflictException, NotFoundException } from '@nestjs/common';
import { GpPracticesService } from './gp-practices.service';

function makePrismaMock() {
  const prisma: any = {
    gpPractice: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
  };
  return prisma;
}

function makeAuditOutboxMock() {
  return { enqueue: jest.fn(), enqueueStandalone: jest.fn() } as any;
}

const validDto = {
  practiceName: 'Riverside Medical Centre',
  hpiO: '8003620000000000',
  contactEmail: 'admin@riverside.example.au',
  state: 'VIC' as const,
};

describe('GpPracticesService', () => {
  it('registers a new practice as verified when the HI Service mock confirms the HPI-O', async () => {
    const prisma = makePrismaMock();
    prisma.gpPractice.findUnique.mockResolvedValue(null);
    prisma.gpPractice.create.mockResolvedValue({
      id: 'gp1',
      ...validDto,
      integrationTier: 'A',
      verificationStatus: 'verified',
    });
    const auditOutbox = makeAuditOutboxMock();
    const hiService = { verifyHpio: jest.fn().mockResolvedValue({ verified: true }) };

    const service = new GpPracticesService(prisma, auditOutbox, hiService as any);
    const result = await service.register(validDto);

    expect(result.verificationStatus).toBe('verified');
    expect(prisma.gpPractice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ verificationStatus: 'verified' }) }),
    );
    expect(auditOutbox.enqueue).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ type: 'gp_practice.hpio_verified' }),
    );
  });

  it('records a failed verification without throwing, so a practice can retry after correcting details', async () => {
    const prisma = makePrismaMock();
    prisma.gpPractice.findUnique.mockResolvedValue(null);
    prisma.gpPractice.create.mockResolvedValue({
      id: 'gp1',
      ...validDto,
      integrationTier: 'A',
      verificationStatus: 'failed',
    });
    const auditOutbox = makeAuditOutboxMock();
    const hiService = { verifyHpio: jest.fn().mockResolvedValue({ verified: false, reason: 'checksum mismatch' }) };

    const service = new GpPracticesService(prisma, auditOutbox, hiService as any);
    const result = await service.register(validDto);

    expect(result.verificationStatus).toBe('failed');
    expect(auditOutbox.enqueue).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ type: 'gp_practice.hpio_verification_failed' }),
    );
  });

  it('rejects registering the same HPI-O twice', async () => {
    const prisma = makePrismaMock();
    prisma.gpPractice.findUnique.mockResolvedValue({ id: 'existing' });
    const auditOutbox = makeAuditOutboxMock();
    const hiService = { verifyHpio: jest.fn() };

    const service = new GpPracticesService(prisma, auditOutbox, hiService as any);
    await expect(service.register(validDto)).rejects.toBeInstanceOf(ConflictException);
    expect(hiService.verifyHpio).not.toHaveBeenCalled();
  });

  it('acknowledges the compliance checklist for an existing practice', async () => {
    const prisma = makePrismaMock();
    prisma.gpPractice.findUnique.mockResolvedValue({ id: 'gp1' });
    prisma.gpPractice.update.mockResolvedValue({ id: 'gp1', complianceChecklistAcknowledgedAt: new Date() });
    const auditOutbox = makeAuditOutboxMock();

    const service = new GpPracticesService(prisma, auditOutbox, {} as any);
    const result = await service.acknowledgeComplianceChecklist('gp1', {
      acknowledgedByName: 'Practice Manager',
      acknowledgedByEmail: 'manager@riverside.example.au',
    });

    expect(result.complianceChecklistAcknowledgedAt).toBeInstanceOf(Date);
    expect(auditOutbox.enqueue).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ type: 'gp_practice.compliance_checklist_acknowledged' }),
    );
  });

  it('404s acknowledging the checklist for an unknown practice', async () => {
    const prisma = makePrismaMock();
    prisma.gpPractice.findUnique.mockResolvedValue(null);
    const service = new GpPracticesService(prisma, makeAuditOutboxMock(), {} as any);

    await expect(
      service.acknowledgeComplianceChecklist('missing', {
        acknowledgedByName: 'x',
        acknowledgedByEmail: 'x@example.com',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
