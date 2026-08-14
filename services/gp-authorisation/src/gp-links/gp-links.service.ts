import { BadRequestException, ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import type { ActorRef, AuditEventType } from '@referralplatform/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGpLinkDto } from './dto/create-gp-link.dto';
import type { GpLinkStatus } from './gp-link-status';

/** Reuses the same 2-day account-activation queue window, per minors-multigp-exception-paths.md section 3. */
export const APPROVAL_WINDOW_MS = 1000 * 60 * 60 * 24 * 2;

export interface GpLinkAuthorisationResult {
  authorised: boolean;
  status: GpLinkStatus | 'no_link';
  linkId?: string;
}

interface OutboxRow {
  type: AuditEventType;
  actor: ActorRef;
  subjectType: string;
  subjectId: string;
  payload: Record<string, unknown>;
}

/** The minimal shape this service needs from a Prisma transaction client — kept narrow so unit tests can fake it easily. */
interface TxClient {
  gpLink: {
    create: (args: any) => Promise<GpLinkRecord>;
    update: (args: any) => Promise<GpLinkRecord>;
  };
  auditOutbox: {
    create: (args: any) => Promise<unknown>;
  };
}

export interface GpLinkRecord {
  id: string;
  patientId: string;
  gpId: string;
  practiceHpiO: string;
  status: string;
  approvalRequestedAt: Date;
  approvalExpiresAt: Date;
  approvedAt: Date | null;
  declinedAt: Date | null;
  revokedAt: Date | null;
  urgentEscalation: boolean;
  urgentJustification: string | null;
  approvedByPrincipalId: string | null;
  declinedByPrincipalId: string | null;
  revokedByPrincipalId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * GP Authorisation Service's core business logic — module 1B of
 * business-process-flow.md. Every state transition here is a
 * consent-relevant write, so every one of them writes an AuditOutbox row in
 * the same DB transaction as the domain write (root CONVENTIONS.md §7's
 * outbox pattern) rather than calling the Audit Log Service directly from
 * the request path.
 */
@Injectable()
export class GpLinksService {
  constructor(private readonly prisma: PrismaService) {}

  async requestLink(dto: CreateGpLinkDto, actor: ActorRef): Promise<GpLinkRecord> {
    if (dto.urgentEscalation && !dto.urgentJustification?.trim()) {
      throw new BadRequestException('urgentJustification is required when urgentEscalation is true');
    }

    const existing = await this.prisma.gpLink.findFirst({
      where: { patientId: dto.patientId, gpId: dto.gpId, status: { in: ['pending_patient_approval', 'approved'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      if (existing.status === 'approved') {
        return existing; // idempotent — already linked, nothing to do
      }
      throw new ConflictException(
        `A ${existing.status} link request already exists for this patient/GP pair (id=${existing.id})`,
      );
    }

    const now = new Date();
    const approvalExpiresAt = new Date(now.getTime() + APPROVAL_WINDOW_MS);
    const isUrgent = dto.urgentEscalation === true;

    return this.prisma.$transaction(async (tx: TxClient) => {
      const link = await tx.gpLink.create({
        data: {
          patientId: dto.patientId,
          gpId: dto.gpId,
          practiceHpiO: dto.practiceHpiO,
          status: isUrgent ? 'approved' : 'pending_patient_approval',
          approvalRequestedAt: now,
          approvalExpiresAt,
          urgentEscalation: isUrgent,
          urgentJustification: dto.urgentJustification ?? null,
          approvedAt: isUrgent ? now : null,
          approvedByPrincipalId: isUrgent ? actor.id : null,
        },
      });

      await this.writeOutbox(tx, {
        type: isUrgent ? 'gp.linked' : 'gp.link.requested',
        actor,
        subjectType: 'GPLink',
        subjectId: link.id,
        payload: {
          patientId: link.patientId,
          gpId: link.gpId,
          practiceHpiO: link.practiceHpiO,
          urgentEscalation: isUrgent,
          ...(isUrgent ? { urgentJustification: dto.urgentJustification, autoApproved: true } : {}),
        },
      });

      return link;
    });
  }

  async getById(id: string): Promise<GpLinkRecord> {
    const link = await this.prisma.gpLink.findUnique({ where: { id } });
    if (!link) {
      throw new NotFoundException(`GPLink ${id} not found`);
    }
    return link;
  }

  async listForPatient(patientId: string, status?: GpLinkStatus): Promise<GpLinkRecord[]> {
    return this.prisma.gpLink.findMany({
      where: { patientId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listForGp(gpId: string, status?: GpLinkStatus): Promise<GpLinkRecord[]> {
    return this.prisma.gpLink.findMany({
      where: { gpId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approve(id: string, actor: ActorRef): Promise<GpLinkRecord> {
    const link = await this.getById(id);
    await this.expireIfPastWindow(link, { throwIfExpired: true });
    if (link.status !== 'pending_patient_approval') {
      throw new ConflictException(`GPLink ${id} is '${link.status}', not pending approval`);
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx: TxClient) => {
      const updated = await tx.gpLink.update({
        where: { id },
        data: { status: 'approved', approvedAt: now, approvedByPrincipalId: actor.id },
      });
      await this.writeOutbox(tx, {
        type: 'gp.linked',
        actor,
        subjectType: 'GPLink',
        subjectId: id,
        payload: { patientId: link.patientId, gpId: link.gpId, practiceHpiO: link.practiceHpiO },
      });
      return updated;
    });
  }

  async decline(id: string, actor: ActorRef, reason?: string): Promise<GpLinkRecord> {
    const link = await this.getById(id);
    if (link.status !== 'pending_patient_approval') {
      throw new ConflictException(`GPLink ${id} is '${link.status}', not pending approval`);
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx: TxClient) => {
      const updated = await tx.gpLink.update({
        where: { id },
        data: { status: 'declined', declinedAt: now, declinedByPrincipalId: actor.id },
      });
      await this.writeOutbox(tx, {
        type: 'gp.link.declined',
        actor,
        subjectType: 'GPLink',
        subjectId: id,
        payload: { patientId: link.patientId, gpId: link.gpId, reason: reason ?? null },
      });
      return updated;
    });
  }

  /** Revokes a currently-approved link (including one created via urgent-bypass) — the "linked GPs, revoke" control on the consent page. */
  async revoke(id: string, actor: ActorRef, reason?: string): Promise<GpLinkRecord> {
    const link = await this.getById(id);
    if (link.status !== 'approved') {
      throw new ConflictException(`GPLink ${id} is '${link.status}' — only an approved link can be revoked`);
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx: TxClient) => {
      const updated = await tx.gpLink.update({
        where: { id },
        data: { status: 'revoked', revokedAt: now, revokedByPrincipalId: actor.id },
      });
      await this.writeOutbox(tx, {
        type: 'gp.link.revoked',
        actor,
        subjectType: 'GPLink',
        subjectId: id,
        payload: { patientId: link.patientId, gpId: link.gpId, reason: reason ?? null },
      });
      return updated;
    });
  }

  /**
   * The enforcement point behind "block referral creation until approved" —
   * the Referral Service is expected to call `GET /gp-links/authorisation`
   * (backed by this method) before creating a referral for a GP not already
   * known to be linked. Lazily expires a stale pending link on read so a
   * caller never gets an authorisation decision based on data older than the
   * approval window, even between cron ticks.
   */
  async checkAuthorisation(patientId: string, gpId: string): Promise<GpLinkAuthorisationResult> {
    const link = await this.prisma.gpLink.findFirst({
      where: { patientId, gpId },
      orderBy: { createdAt: 'desc' },
    });
    if (!link) {
      return { authorised: false, status: 'no_link' };
    }
    if (link.status === 'pending_patient_approval' && link.approvalExpiresAt.getTime() < Date.now()) {
      await this.expireOne(link);
      return { authorised: false, status: 'expired', linkId: link.id };
    }
    return { authorised: link.status === 'approved', status: link.status as GpLinkStatus, linkId: link.id };
  }

  /** Invoked periodically by GpLinkExpiryService (a @nestjs/schedule cron) — also callable directly for tests/ops. */
  async expireStalePendingLinks(): Promise<number> {
    const stale = await this.prisma.gpLink.findMany({
      where: { status: 'pending_patient_approval', approvalExpiresAt: { lt: new Date() } },
    });
    for (const link of stale) {
      await this.expireOne(link);
    }
    return stale.length;
  }

  private async expireIfPastWindow(link: GpLinkRecord, opts: { throwIfExpired: boolean }): Promise<void> {
    if (link.status === 'pending_patient_approval' && link.approvalExpiresAt.getTime() < Date.now()) {
      await this.expireOne(link);
      if (opts.throwIfExpired) {
        throw new GoneException(
          `GPLink ${link.id}'s approval window has expired — the GP must resend the link request`,
        );
      }
    }
  }

  private async expireOne(link: Pick<GpLinkRecord, 'id' | 'patientId' | 'gpId'>): Promise<void> {
    await this.prisma.$transaction(async (tx: TxClient) => {
      await tx.gpLink.update({ where: { id: link.id }, data: { status: 'expired' } });
      await this.writeOutbox(tx, {
        // shared-types' AuditEventType (packages/shared-types/src/audit-event.ts)
        // has no dedicated "link expired" variant. Reusing 'gp.link.declined'
        // with payload.reason='expired_no_response' is the closest accurate
        // fit without editing a shared package outside this service's scope
        // — see BUILD_LOG/gp-authorisation.md for this judgment call.
        type: 'gp.link.declined',
        actor: { principalType: 'system', id: 'gp-authorisation-service' },
        subjectType: 'GPLink',
        subjectId: link.id,
        payload: { patientId: link.patientId, gpId: link.gpId, reason: 'expired_no_response' },
      });
    });
  }

  private async writeOutbox(tx: TxClient, row: OutboxRow): Promise<void> {
    await tx.auditOutbox.create({
      data: {
        type: row.type,
        actor: row.actor as unknown as object,
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        payload: row.payload as unknown as object,
      },
    });
  }
}
