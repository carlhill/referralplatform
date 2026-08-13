import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { writeOutbox, type OutboxTxClient } from '../audit-outbox/outbox-writer';
import { EventsService } from '../events/events.service';
import { FlagDeceasedDto } from './dto/flag-deceased.dto';

export interface DeceasedFlagEntity {
  id: string;
  patientId: string;
  flaggedAt: Date;
  flaggedByGpId: string;
  state: string;
  reason: string | null;
  freezeConfirmedAt: Date;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface TxClient extends OutboxTxClient {
  deceasedFlag: {
    create: (args: unknown) => Promise<DeceasedFlagEntity>;
    update: (args: unknown) => Promise<DeceasedFlagEntity>;
  };
  publishedEvent: {
    create: (args: unknown) => Promise<unknown>;
  };
}

/**
 * The GP-triggered deceased-patient flag/freeze workflow —
 * complaints-continuity-deceased.md section 3. "A GP flags a patient as
 * deceased ... This immediately: freezes the account ... suppresses every
 * pending reminder ... and administratively closes any referral still
 * sitting in the 2-day activation queue." This service owns the flag and
 * the freeze *signal*; the actual login-blocking (Onboarding & Account /
 * Identity & Access) and reminder/queue suppression (Follow-up & Recall,
 * Referral Service) happen in those other services, which are expected to
 * poll `GET /events?type=patient.deceased.frozen` (see events.service.ts)
 * — see BUILD_LOG/consent-security.md for the full integration contract.
 */
@Injectable()
export class DeceasedFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async flag(dto: FlagDeceasedDto, actor: ActorRef): Promise<DeceasedFlagEntity> {
    const existing = await this.prisma.deceasedFlag.findUnique({ where: { patientId: dto.patientId } });
    if (existing?.active) {
      throw new ConflictException(`Patient ${dto.patientId} is already flagged deceased (flag id=${existing.id})`);
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx: TxClient) => {
      const flag = existing
        ? await tx.deceasedFlag.update({
            where: { id: existing.id },
            data: {
              active: true,
              flaggedAt: now,
              flaggedByGpId: dto.flaggedByGpId,
              state: dto.state,
              reason: dto.reason ?? null,
              freezeConfirmedAt: now,
            },
          })
        : await tx.deceasedFlag.create({
            data: {
              patientId: dto.patientId,
              flaggedByGpId: dto.flaggedByGpId,
              state: dto.state,
              reason: dto.reason ?? null,
              flaggedAt: now,
              freezeConfirmedAt: now,
            },
          });

      await writeOutbox(tx, {
        type: 'patient.deceased.flagged',
        actor,
        subjectType: 'Patient',
        subjectId: dto.patientId,
        payload: { flagId: flag.id, state: dto.state, reason: dto.reason ?? null },
      });

      // The cross-service freeze signal — Follow-up & Recall (suppress every
      // pending reminder, including already-scheduled-but-not-yet-sent ones
      // per claude/modules-and-requirements.md's Follow-up & Recall
      // requirements) and Referral Service (administratively close any
      // referral in the 2-day activation queue) both subscribe to this.
      await this.events.publishInTx(tx, 'patient.deceased.frozen', dto.patientId, {
        flagId: flag.id,
        suppress: ['followup_reminders', 'queued_referral_activation'],
        carerDelegateAccessRevoked: true,
      });

      return flag;
    });
  }

  async getActiveFlag(patientId: string): Promise<DeceasedFlagEntity> {
    const flag = await this.prisma.deceasedFlag.findUnique({ where: { patientId } });
    if (!flag?.active) {
      throw new NotFoundException(`Patient ${patientId} does not have an active deceased flag`);
    }
    return flag;
  }

  async findByPatientId(patientId: string): Promise<DeceasedFlagEntity | null> {
    return this.prisma.deceasedFlag.findUnique({ where: { patientId } });
  }

  async listActive(): Promise<DeceasedFlagEntity[]> {
    return this.prisma.deceasedFlag.findMany({ where: { active: true }, orderBy: { flaggedAt: 'desc' } });
  }
}
