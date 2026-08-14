import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ActorRef, AuditEventType } from '@referralplatform/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { ComplianceRulesService } from '../compliance-rules/compliance-rules.service';
import { GpAuthorisationClient } from '../common/gp-authorisation.client';
import { CreateReferralDto } from './dto/create-referral.dto';
import { ALLOWED_TRANSITIONS, auditEventTypeForStatus, type ReferralStatus } from './referral-status';

/** The 2-day activation queue window — same duration as the GP-link approval window (module 1B), per business-process-flow.md ("up to 2 days if account still activating"). */
export const QUEUE_WINDOW_MS = 1000 * 60 * 60 * 24 * 2;

export interface ReferralRecord {
  id: string;
  patientId: string;
  gpId: string;
  specialistId: string | null;
  status: string;
  origin: string;
  urgent: boolean;
  reasonForReferral: string;
  aiStructuredSummary: unknown;
  gpState: string;
  patientIsMinor: boolean;
  dvIndicated: boolean;
  complexCase: boolean;
  consentGrants: unknown;
  queueExpiresAt: Date | null;
  lapsedAt: Date | null;
  routedAt: Date | null;
  declinedAt: Date | null;
  declinedReason: string | null;
  bookedAt: Date | null;
  reviewStartedAt: Date | null;
  resolvedEconsultAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelledReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ComplianceFlagRow {
  id: string;
  referralId: string;
  category: string;
  jurisdiction: string;
  rulesetVersion: string;
  checklistPresentedAt: Date;
  checklistAcknowledgedAt: Date | null;
  acknowledgementNote: string | null;
  createdAt: Date;
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
  referral: {
    create: (args: any) => Promise<ReferralRecord>;
    update: (args: any) => Promise<ReferralRecord>;
    findUnique: (args: any) => Promise<ReferralRecord | null>;
    findFirst: (args: any) => Promise<ReferralRecord | null>;
    findMany: (args: any) => Promise<ReferralRecord[]>;
  };
  complianceFlag: {
    create: (args: any) => Promise<ComplianceFlagRow>;
    findMany: (args: any) => Promise<ComplianceFlagRow[]>;
    findFirst: (args: any) => Promise<ComplianceFlagRow | null>;
    update: (args: any) => Promise<ComplianceFlagRow>;
  };
  auditOutbox: {
    create: (args: any) => Promise<unknown>;
  };
}

/**
 * Referral Service's core business logic — module #5 of
 * modules-and-requirements.md / module 2-6 of business-process-flow.md: the
 * full referral state machine, the urgent fast-path flag, the 2-day
 * activation queue with lapse/notify, and resumability after interruption.
 *
 * Every state transition is a clinical/consent-relevant write, so every one
 * writes an AuditOutbox row in the same DB transaction as the domain write
 * (root CONVENTIONS.md §7's outbox pattern) rather than calling the Audit
 * Log Service directly from the request path.
 *
 * **Resumability**: nothing about this service's own process lifetime is
 * load-bearing for a referral's correctness. Every state transition is one
 * atomic DB transaction (a referral is never left half-written); the
 * time-based transition (queue expiry) is re-derived from `queueExpiresAt`
 * every time it matters, both lazily (on any read/transition attempt via
 * `expireIfPastWindow`) and proactively (`ReferralQueueExpiryScheduler`'s
 * periodic sweep) — so a referral interrupted mid-queue by a platform
 * outage (this service crashing, restarting, or simply not running for a
 * while) always resolves to the same correct state once it's running
 * again, never lost, never double-lapsed, never double-audited (the sweep
 * only acts on referrals still in `queued` with a past `queueExpiresAt`).
 */
@Injectable()
export class ReferralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly complianceRules: ComplianceRulesService,
    private readonly gpAuth: GpAuthorisationClient,
  ) {}

  /**
   * Creates a referral — module 2/3 of business-process-flow.md. Order of
   * operations, all real, none stubbed:
   *   1. Block creation unless the GP is authorised for this patient (calls
   *      the real GP Authorisation Service — see GpAuthorisationClient;
   *      `dto.skipGpAuthorisationCheck` is a test/ops escape hatch only).
   *   2. Evaluate the Compliance Rules Engine against the GP-asserted
   *      minor/DV/complex flags and the treating GP's state, raising a
   *      ComplianceFlag row (decision support only) for every rule that
   *      matches.
   *   3. Decide queued vs. immediately-routed based on
   *      `dto.patientAccountActive` — see that DTO field's doc comment for
   *      why this is caller-supplied rather than a live cross-service
   *      lookup in this build.
   * Everything in step 2/3 (the Referral row, every ComplianceFlag row, and
   * every AuditOutbox row) commits in one transaction.
   */
  async create(
    dto: CreateReferralDto,
    actor: ActorRef,
  ): Promise<ReferralRecord & { complianceFlags: ComplianceFlagRow[] }> {
    if (!dto.skipGpAuthorisationCheck) {
      const authResult = await this.gpAuth.checkAuthorisation(dto.patientId, dto.gpId);
      if (!authResult.authorised) {
        throw new ForbiddenException(
          `GP ${dto.gpId} is not authorised to refer for patient ${dto.patientId} (status=${authResult.status}). ` +
            `Request a GP link via the GP Authorisation Service first, or use its urgent-bypass escalation.`,
        );
      }
    }

    const matchedRules = await this.complianceRules.evaluate({
      gpState: dto.gpState as any,
      patientIsMinor: dto.patientIsMinor ?? false,
      dvIndicated: dto.dvIndicated ?? false,
      complexCase: dto.complexCase ?? false,
    });

    const now = new Date();
    const accountActive = dto.patientAccountActive === true;
    const initialStatus: ReferralStatus = accountActive ? 'routed' : 'queued';

    return this.prisma.$transaction(async (tx: TxClient) => {
      const referral = await tx.referral.create({
        data: {
          patientId: dto.patientId,
          gpId: dto.gpId,
          specialistId: dto.specialistId ?? null,
          status: initialStatus,
          origin: dto.origin,
          urgent: dto.urgent ?? false,
          reasonForReferral: dto.reasonForReferral,
          gpState: dto.gpState,
          patientIsMinor: dto.patientIsMinor ?? false,
          dvIndicated: dto.dvIndicated ?? false,
          complexCase: dto.complexCase ?? false,
          consentGrants: (dto.consentGrants ?? []).map((g) => ({
            granteeId: g.granteeId,
            grantedAt: now.toISOString(),
          })),
          queueExpiresAt: accountActive ? null : new Date(now.getTime() + QUEUE_WINDOW_MS),
          routedAt: accountActive ? now : null,
        },
      });

      await this.writeOutbox(tx, {
        type: 'referral.created',
        actor,
        subjectType: 'Referral',
        subjectId: referral.id,
        payload: {
          patientId: referral.patientId,
          gpId: referral.gpId,
          origin: referral.origin,
          urgent: referral.urgent,
          gpState: referral.gpState,
        },
      });
      await this.writeOutbox(tx, {
        type: auditEventTypeForStatus(initialStatus),
        actor,
        subjectType: 'Referral',
        subjectId: referral.id,
        payload: accountActive
          ? { fromStatus: null, toStatus: 'routed', reason: 'patient_account_already_active' }
          : { fromStatus: null, toStatus: 'queued', queueExpiresAt: referral.queueExpiresAt },
      });

      const complianceFlags: ComplianceFlagRow[] = [];
      for (const rule of matchedRules) {
        const flag = await tx.complianceFlag.create({
          data: {
            referralId: referral.id,
            category: rule.category,
            jurisdiction: rule.jurisdiction,
            rulesetVersion: rule.version,
            checklistPresentedAt: now,
          },
        });
        complianceFlags.push(flag);
        await this.writeOutbox(tx, {
          // See referral-status.ts's auditEventTypeForStatus doc comment —
          // AuditEventType has no dedicated "compliance flag raised" entry.
          // Reusing 'referral.created' (documented judgment call, same
          // precedent as gp-authorisation's link-expiry handling) —
          // disambiguated via payload.event and the flag's own subjectType.
          type: 'referral.created',
          actor,
          subjectType: 'ComplianceFlag',
          subjectId: flag.id,
          payload: {
            event: 'compliance_flag.raised',
            referralId: referral.id,
            category: rule.category,
            jurisdiction: rule.jurisdiction,
            rulesetVersion: rule.version,
            requiresWwcc: rule.requiresWwcc,
            exemptForAhpraRegistered: rule.exemptForAhpraRegistered,
          },
        });
      }

      return { ...referral, complianceFlags };
    });
  }

  async getById(id: string): Promise<ReferralRecord> {
    const referral = await this.prisma.referral.findUnique({ where: { id } });
    if (!referral) {
      throw new NotFoundException(`Referral ${id} not found`);
    }
    return referral;
  }

  async list(filter: { patientId?: string; gpId?: string; status?: ReferralStatus }): Promise<ReferralRecord[]> {
    return this.prisma.referral.findMany({
      where: {
        ...(filter.patientId ? { patientId: filter.patientId } : {}),
        ...(filter.gpId ? { gpId: filter.gpId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getComplianceFlags(referralId: string): Promise<ComplianceFlagRow[]> {
    await this.getById(referralId); // 404s if the referral doesn't exist
    return this.prisma.complianceFlag.findMany({ where: { referralId }, orderBy: { checklistPresentedAt: 'asc' } });
  }

  /**
   * A GP/practice staff member acknowledging a compliance checklist flag —
   * decision support only, never a legal certification (onboarding-processes.md).
   */
  async acknowledgeComplianceFlag(
    referralId: string,
    flagId: string,
    actor: ActorRef,
    note?: string,
  ): Promise<ComplianceFlagRow> {
    const flag = await this.prisma.complianceFlag.findFirst({ where: { id: flagId, referralId } });
    if (!flag) {
      throw new NotFoundException(`ComplianceFlag ${flagId} not found on referral ${referralId}`);
    }
    if (flag.checklistAcknowledgedAt) {
      return flag; // idempotent
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx: TxClient) => {
      const updated = await tx.complianceFlag.update({
        where: { id: flagId },
        data: { checklistAcknowledgedAt: now, acknowledgementNote: note ?? null },
      });
      await this.writeOutbox(tx, {
        // See create()'s outbox call for why AuditEventType is reused here
        // too — 'consent.granted' is the closest available neighbor for "a
        // human formally attested to/signed off on something", disambiguated
        // via payload.event.
        type: 'consent.granted',
        actor,
        subjectType: 'ComplianceFlag',
        subjectId: flagId,
        payload: { event: 'compliance_flag.acknowledged', referralId, category: flag.category, note: note ?? null },
      });
      return updated;
    });
  }

  /**
   * Called once a patient's account activation completes (by the
   * Onboarding & Account Service, once it exposes the corresponding
   * webhook/callback — see BUILD_LOG/referral.md's "known gaps") — routes
   * every referral still sitting in this patient's 2-day activation queue,
   * rather than each one having to wait out its own timer. Also directly
   * callable/idempotent for tests and ops.
   */
  async activateQueuedForPatient(patientId: string, actor: ActorRef): Promise<number> {
    const queued = await this.prisma.referral.findMany({ where: { patientId, status: 'queued' } });
    let routedCount = 0;
    for (const referral of queued) {
      await this.transition(referral.id, 'routed', actor, { reason: 'patient_account_activated' });
      routedCount += 1;
    }
    return routedCount;
  }

  async decline(id: string, actor: ActorRef, reason?: string): Promise<ReferralRecord> {
    return this.transition(id, 'declined', actor, { declinedReason: reason ?? null }, { declinedAt: true });
  }

  /** Called by the Booking Service once a slot is confirmed — see booking.confirmed's real home, services/booking. */
  async book(id: string, actor: ActorRef): Promise<ReferralRecord> {
    return this.transition(id, 'booked', actor, {}, { bookedAt: true });
  }

  async startReview(id: string, actor: ActorRef): Promise<ReferralRecord> {
    return this.transition(id, 'in_review', actor, {}, { reviewStartedAt: true });
  }

  async resolveEconsult(id: string, actor: ActorRef): Promise<ReferralRecord> {
    return this.transition(id, 'resolved_econsult', actor, {}, { resolvedEconsultAt: true });
  }

  async complete(id: string, actor: ActorRef): Promise<ReferralRecord> {
    return this.transition(id, 'completed', actor, {}, { completedAt: true });
  }

  async cancel(id: string, actor: ActorRef, reason?: string): Promise<ReferralRecord> {
    return this.transition(id, 'cancelled', actor, { cancelledReason: reason ?? null }, { cancelledAt: true });
  }

  /**
   * Invoked periodically by ReferralQueueExpiryScheduler (a
   * @nestjs/schedule cron) — also callable directly for tests/ops. The
   * "queue expires with no patient response -> GP notified referral
   * lapsed" path from business-process-flow.md module 2/
   * minors-multigp-exception-paths.md section 2.
   */
  async expireStaleQueuedReferrals(): Promise<number> {
    const stale = await this.prisma.referral.findMany({
      where: { status: 'queued', queueExpiresAt: { lt: new Date() } },
    });
    for (const referral of stale) {
      await this.transition(
        referral.id,
        'lapsed',
        { principalType: 'system', id: 'referral-service' },
        {},
        { lapsedAt: true },
      );
    }
    return stale.length;
  }

  /**
   * The single enforcement point for every status change: validates the
   * transition against `ALLOWED_TRANSITIONS`, lazily lapses a queued
   * referral whose window has already passed (resumability — see class
   * doc comment), applies the DB update, and writes the outbox row, all in
   * one transaction.
   */
  private async transition(
    id: string,
    to: ReferralStatus,
    actor: ActorRef,
    extraFields: Record<string, unknown>,
    timestampFlags: Record<string, boolean> = {},
  ): Promise<ReferralRecord> {
    const referral = await this.getById(id);

    if (
      referral.status === 'queued' &&
      referral.queueExpiresAt &&
      referral.queueExpiresAt.getTime() < Date.now() &&
      to !== 'lapsed'
    ) {
      // Catch up a referral that should already have lapsed before honouring
      // any other requested transition — the same lazy-expiry pattern
      // gp-authorisation's checkAuthorisation()/expireIfPastWindow() use.
      await this.transition(id, 'lapsed', { principalType: 'system', id: 'referral-service' }, {}, { lapsedAt: true });
      throw new ConflictException(`Referral ${id}'s 2-day activation queue had already expired — it is now 'lapsed'`);
    }

    const from = referral.status as ReferralStatus;
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw new ConflictException(`Referral ${id} cannot transition from '${from}' to '${to}'`);
    }

    const now = new Date();
    const data: Record<string, unknown> = { status: to, ...extraFields };
    for (const [field, shouldSet] of Object.entries(timestampFlags)) {
      if (shouldSet) data[field] = now;
    }

    return this.prisma.$transaction(async (tx: TxClient) => {
      const updated = await tx.referral.update({ where: { id }, data });
      await this.writeOutbox(tx, {
        type: auditEventTypeForStatus(to),
        actor,
        subjectType: 'Referral',
        subjectId: id,
        payload: { fromStatus: from, toStatus: to, ...extraFields },
      });
      return updated;
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
