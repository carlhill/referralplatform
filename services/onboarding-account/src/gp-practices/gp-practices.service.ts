import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditOutboxService } from '../audit-outbox/audit-outbox.service';
import { HiServiceClient } from '../hi-service/hi-service.interface';
import { RegisterGpPracticeDto } from './dto/register-gp-practice.dto';
import { AcknowledgeComplianceChecklistDto } from './dto/acknowledge-compliance-checklist.dto';

/**
 * GP practice onboarding — see onboarding-processes.md ("Onboarding process
 * — GP practice"). Deliberately practice-level, not individual-GP
 * self-signup: only a verified, compliance-acknowledged practice's HPI-O can
 * trigger a patient account-activation request (enforced in
 * onboarding.service.ts's `assertVerifiedPractice`), which is what closes
 * the "fake GP practice" fraud surface this doc calls out.
 */
@Injectable()
export class GpPracticesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditOutbox: AuditOutboxService,
    private readonly hiService: HiServiceClient,
  ) {}

  async register(dto: RegisterGpPracticeDto) {
    const existing = await this.prisma.gpPractice.findUnique({ where: { hpiO: dto.hpiO } });
    if (existing) {
      throw new ConflictException(`A GP practice is already registered against HPI-O ${dto.hpiO}.`);
    }

    const verification = await this.hiService.verifyHpio({ hpiO: dto.hpiO, practiceName: dto.practiceName });

    const practice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.gpPractice.create({
        data: {
          practiceName: dto.practiceName,
          hpiO: dto.hpiO,
          contactEmail: dto.contactEmail,
          state: dto.state,
          integrationTier: dto.integrationTier ?? 'A',
          verificationStatus: verification.verified ? 'verified' : 'failed',
        },
      });
      await this.auditOutbox.enqueue(tx, {
        type: 'gp_practice.registration_requested',
        actor: { principalType: 'system', id: 'onboarding-account-service' },
        subject: { type: 'GpPractice', id: created.id },
        payload: { hpiO: dto.hpiO, integrationTier: created.integrationTier },
      });
      await this.auditOutbox.enqueue(tx, {
        type: verification.verified ? 'gp_practice.hpio_verified' : 'gp_practice.hpio_verification_failed',
        actor: { principalType: 'system', id: 'onboarding-account-service' },
        subject: { type: 'GpPractice', id: created.id },
        payload: { reason: verification.reason },
      });
      return created;
    });

    return practice;
  }

  async acknowledgeComplianceChecklist(id: string, dto: AcknowledgeComplianceChecklistDto) {
    const practice = await this.prisma.gpPractice.findUnique({ where: { id } });
    if (!practice) {
      throw new NotFoundException('No such GP practice');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.gpPractice.update({
        where: { id },
        data: {
          complianceChecklistAcknowledgedAt: new Date(),
          complianceChecklistAcknowledgedByName: dto.acknowledgedByName,
          complianceChecklistAcknowledgedByEmail: dto.acknowledgedByEmail,
        },
      });
      await this.auditOutbox.enqueue(tx, {
        type: 'gp_practice.compliance_checklist_acknowledged',
        actor: { principalType: 'gp', id: dto.acknowledgedByEmail },
        subject: { type: 'GpPractice', id },
        payload: { acknowledgedByName: dto.acknowledgedByName },
      });
      return result;
    });

    return updated;
  }

  async findById(id: string) {
    const practice = await this.prisma.gpPractice.findUnique({ where: { id } });
    if (!practice) {
      throw new NotFoundException('No such GP practice');
    }
    return practice;
  }
}
