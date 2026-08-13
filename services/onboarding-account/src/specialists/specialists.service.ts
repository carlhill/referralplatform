import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditOutboxService } from '../audit-outbox/audit-outbox.service';
import { AhpraVerificationClient } from '../ahpra/ahpra.interface';
import { HiServiceClient } from '../hi-service/hi-service.interface';
import { NashCredentialClient } from '../nash/nash.interface';
import { DirectoryClient } from '../directory-client/directory.client';
import { RegisterSpecialistDto } from './dto/register-specialist.dto';

/**
 * Specialist onboarding — see onboarding-processes.md ("Onboarding process —
 * Specialist"). Runs the full chain in one request: AHPRA registration
 * check -> HPI-I resolution -> NASH credential provisioning -> Directory
 * Service profile creation. Each step's MOCK/real-HTTP nature is documented
 * at its own client (src/ahpra, src/hi-service, src/nash,
 * src/directory-client) — this service just sequences them and records the
 * outcome of each on the Specialist row rather than silently swallowing a
 * partial failure.
 */
@Injectable()
export class SpecialistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditOutbox: AuditOutboxService,
    private readonly ahpra: AhpraVerificationClient,
    private readonly hiService: HiServiceClient,
    private readonly nash: NashCredentialClient,
    private readonly directory: DirectoryClient,
  ) {}

  async register(dto: RegisterSpecialistDto) {
    const existing = await this.prisma.specialist.findUnique({ where: { ahpraNumber: dto.ahpraNumber.toUpperCase() } });
    if (existing) {
      throw new ConflictException(`A specialist is already registered against AHPRA number ${dto.ahpraNumber}.`);
    }

    const ahpraResult = await this.ahpra.verifyRegistration({
      ahpraNumber: dto.ahpraNumber,
      familyName: dto.familyName,
    });

    let specialist = await this.prisma.$transaction(async (tx) => {
      const created = await tx.specialist.create({
        data: {
          givenName: dto.givenName,
          familyName: dto.familyName,
          contactEmail: dto.contactEmail,
          ahpraNumber: dto.ahpraNumber.toUpperCase(),
          ahpraVerificationStatus: ahpraResult.verified ? 'verified' : 'failed',
          specialty: ahpraResult.specialty,
          registrationStatus: ahpraResult.registrationStatus,
        },
      });
      await this.auditOutbox.enqueue(tx, {
        type: 'specialist.registration_requested',
        actor: { principalType: 'system', id: 'onboarding-account-service' },
        subject: { type: 'Specialist', id: created.id },
        payload: { ahpraNumber: created.ahpraNumber },
      });
      await this.auditOutbox.enqueue(tx, {
        type: ahpraResult.verified ? 'specialist.ahpra_verified' : 'specialist.ahpra_verification_failed',
        actor: { principalType: 'system', id: 'onboarding-account-service' },
        subject: { type: 'Specialist', id: created.id },
        payload: { reason: ahpraResult.reason, specialty: ahpraResult.specialty },
      });
      return created;
    });

    // AHPRA verification failed — stop here. HPI-I resolution, NASH
    // credentialling, and directory listing all presuppose a currently
    // registered practitioner; proceeding would let an unverified
    // "specialist" get as far as a directory listing.
    if (!ahpraResult.verified) {
      return specialist;
    }

    const hpiiResult = await this.hiService.resolveHpii({
      ahpraNumber: dto.ahpraNumber,
      givenName: dto.givenName,
      familyName: dto.familyName,
    });

    if (hpiiResult.resolved && hpiiResult.hpiI) {
      specialist = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.specialist.update({
          where: { id: specialist.id },
          data: { hpiI: hpiiResult.hpiI, hpiIResolutionStatus: 'resolved' },
        });
        await this.auditOutbox.enqueue(tx, {
          type: 'specialist.hpii_resolved',
          actor: { principalType: 'system', id: 'onboarding-account-service' },
          subject: { type: 'Specialist', id: specialist.id },
          payload: {},
        });
        return updated;
      });

      const nashResult = await this.nash.provision({ hpiI: hpiiResult.hpiI, organisationName: dto.familyName });
      specialist = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.specialist.update({
          where: { id: specialist.id },
          data: { nashCredentialId: nashResult.nashCredentialId, nashCredentialStatus: nashResult.status },
        });
        await this.auditOutbox.enqueue(tx, {
          type: 'specialist.nash_credential_provisioned',
          actor: { principalType: 'system', id: 'onboarding-account-service' },
          subject: { type: 'Specialist', id: specialist.id },
          payload: { nashCredentialId: nashResult.nashCredentialId },
        });
        return updated;
      });
    } else {
      specialist = await this.prisma.specialist.update({
        where: { id: specialist.id },
        data: { hpiIResolutionStatus: 'failed' },
      });
    }

    const directoryResult = await this.directory.createProfile({
      specialistId: specialist.id,
      givenName: specialist.givenName,
      familyName: specialist.familyName,
      specialty: specialist.specialty ?? undefined,
      hpiI: specialist.hpiI ?? undefined,
      contactEmail: specialist.contactEmail,
    });

    specialist = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.specialist.update({
        where: { id: specialist.id },
        data: {
          directoryProfileId: directoryResult.directoryProfileId,
          directoryProfileStatus: directoryResult.created ? 'created' : 'pending_directory_service',
        },
      });
      await this.auditOutbox.enqueue(tx, {
        type: directoryResult.created
          ? 'specialist.directory_profile_created'
          : 'specialist.directory_profile_creation_failed',
        actor: { principalType: 'system', id: 'onboarding-account-service' },
        subject: { type: 'Specialist', id: specialist.id },
        payload: { reason: directoryResult.reason },
      });
      return updated;
    });

    return specialist;
  }

  async setEconsultOptIn(id: string, optIn: boolean) {
    const specialist = await this.prisma.specialist.findUnique({ where: { id } });
    if (!specialist) {
      throw new NotFoundException('No such specialist');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.specialist.update({
        where: { id },
        data: { econsultOptIn: optIn, econsultOptInAt: new Date() },
      });
      await this.auditOutbox.enqueue(tx, {
        type: 'specialist.econsult_opt_in_changed',
        actor: { principalType: 'specialist', id },
        subject: { type: 'Specialist', id },
        payload: { optIn },
      });
      return result;
    });
    return updated;
  }

  async findById(id: string) {
    const specialist = await this.prisma.specialist.findUnique({ where: { id } });
    if (!specialist) {
      throw new NotFoundException('No such specialist');
    }
    return specialist;
  }
}
