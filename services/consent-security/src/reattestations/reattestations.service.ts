import { Injectable, NotFoundException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { writeOutbox, type OutboxTxClient } from '../audit-outbox/outbox-writer';
import { ScheduleReattestationDto } from './dto/schedule-reattestation.dto';

export interface ReattestationScheduleEntity {
  id: string;
  carerId: string;
  patientId: string;
  relationship: string;
  cadenceDays: number;
  lastReattestedAt: Date | null;
  nextDueAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface TxClient extends OutboxTxClient {
  reattestationSchedule: {
    update: (args: unknown) => Promise<ReattestationScheduleEntity>;
  };
}

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Periodic carer/delegate re-attestation scheduling —
 * claude/modules-and-requirements.md's Consent & Security requirements,
 * identity-security-recommendations.md section 3 step 7 ("Re-attest
 * periodically ... ask 'is [carer] still assisting you?'"). Carer records
 * themselves belong to the Onboarding & Account Service; this service tracks
 * only *when a re-attestation is next due* for a given carer/patient pair —
 * see BUILD_LOG/consent-security.md for the documented judgment call on this
 * scope boundary.
 */
@Injectable()
export class ReattestationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Upsert — called once when a carer/delegate relationship is first created, and safe to call again to change cadence. */
  async schedule(dto: ScheduleReattestationDto): Promise<ReattestationScheduleEntity> {
    const cadenceDays = dto.cadenceDays ?? 365;
    const nextDueAt = new Date(Date.now() + cadenceDays * DAY_MS);
    return this.prisma.reattestationSchedule.upsert({
      where: { carerId_patientId: { carerId: dto.carerId, patientId: dto.patientId } },
      update: { relationship: dto.relationship, cadenceDays },
      create: {
        carerId: dto.carerId,
        patientId: dto.patientId,
        relationship: dto.relationship,
        cadenceDays,
        nextDueAt,
      },
    });
  }

  async getById(id: string): Promise<ReattestationScheduleEntity> {
    const record = await this.prisma.reattestationSchedule.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException(`ReattestationSchedule ${id} not found`);
    }
    return record;
  }

  /** Patient (or carer, self-attesting) confirms the relationship is still valid — resets the clock. */
  async attest(id: string, actor: ActorRef): Promise<ReattestationScheduleEntity> {
    const record = await this.getById(id);
    const now = new Date();
    const nextDueAt = new Date(now.getTime() + record.cadenceDays * DAY_MS);
    return this.prisma.$transaction(async (tx: TxClient) => {
      const updated = await tx.reattestationSchedule.update({
        where: { id },
        data: { lastReattestedAt: now, nextDueAt },
      });
      await writeOutbox(tx, {
        type: 'carer.reattested',
        actor,
        subjectType: 'ReattestationSchedule',
        subjectId: id,
        payload: { carerId: record.carerId, patientId: record.patientId, relationship: record.relationship },
      });
      return updated;
    });
  }

  /**
   * Reminder feed the Notification Service polls — mirrors the interim
   * polling-based pattern documented for PublishedEvent (see
   * BUILD_LOG/consent-security.md) since no message queue is wired yet.
   */
  async listDue(asOf: Date = new Date()): Promise<ReattestationScheduleEntity[]> {
    return this.prisma.reattestationSchedule.findMany({
      where: { nextDueAt: { lte: asOf } },
      orderBy: { nextDueAt: 'asc' },
    });
  }

  async listForPatient(patientId: string): Promise<ReattestationScheduleEntity[]> {
    return this.prisma.reattestationSchedule.findMany({ where: { patientId }, orderBy: { nextDueAt: 'asc' } });
  }
}
