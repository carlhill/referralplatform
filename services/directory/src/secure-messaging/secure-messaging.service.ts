import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ActorRef, AuditEventType } from '@referralplatform/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { RouteReferralDto } from './dto/route-referral.dto';
import { SecureMessagingDeliveryException } from './exceptions/secure-messaging-delivery.exception';
import {
  DIRECT_DELIVERY_CLIENT,
  HEALTHLINK_CLIENT,
  MEDICAL_OBJECTS_CLIENT,
  type SecureMessagingVendorClient,
} from './vendors/vendor-client.interface';
import { SecureMessagingVendorError } from './vendors/vendor-error';

export interface RoutingAttemptRecord {
  id: string;
  referralId: string;
  directoryEntryId: string | null;
  method: string;
  vendor: string | null;
  status: string;
  attemptNumber: number;
  failureReason: string | null;
  vendorMessageId: string | null;
  attemptedAt: Date;
  resolvedAt: Date | null;
}

interface DirectoryEntryLookup {
  id: string;
  hpiI: string | null;
  onboardedForDirectDelivery: boolean;
  secureMessagingVendor: string | null;
  secureMessagingEndpointId: string | null;
}

interface OutboxRow {
  type: AuditEventType;
  actor: ActorRef;
  subjectType: string;
  subjectId: string;
  payload: Record<string, unknown>;
}

/** The minimal Prisma surface this service needs — kept narrow so unit tests can fake it easily. */
interface TxClient {
  routingAttempt: {
    update: (args: any) => Promise<RoutingAttemptRecord>;
  };
  auditOutbox: {
    create: (args: any) => Promise<unknown>;
  };
}

interface SecureMessagingPrisma {
  directoryEntry: {
    findUnique: (args: any) => Promise<DirectoryEntryLookup | null>;
  };
  routingAttempt: {
    create: (args: any) => Promise<RoutingAttemptRecord>;
    update: (args: any) => Promise<RoutingAttemptRecord>;
    findUnique: (args: any) => Promise<RoutingAttemptRecord | null>;
    findMany: (args: any) => Promise<RoutingAttemptRecord[]>;
  };
  $transaction: <T>(fn: (tx: TxClient) => Promise<T>) => Promise<T>;
}

/**
 * Secure Messaging Gateway's core business logic — module 8 of
 * modules-and-requirements.md. Routes a referral either via a secure
 * messaging vendor (HealthLink/Medical-Objects, mocked — see vendors/) or
 * directly to an onboarded specialist's platform inbox, behind one common
 * `SecureMessagingVendorClient` interface so adding a third vendor never
 * touches this routing logic.
 *
 * Every routing *resolution* (delivered or failed) is a referral-lifecycle
 * event — shared-types' `AuditEventType` already has `'referral.routed'`
 * for exactly this — so it's written via the outbox pattern (root
 * CONVENTIONS.md §7) in the same DB transaction as the `RoutingAttempt`
 * state update, unlike the plain Directory Service writes in
 * `directory.service.ts` (see that file's doc comment for why those differ).
 */
@Injectable()
export class SecureMessagingService {
  private readonly logger = new Logger(SecureMessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(HEALTHLINK_CLIENT) private readonly healthLinkClient: SecureMessagingVendorClient,
    @Inject(MEDICAL_OBJECTS_CLIENT) private readonly medicalObjectsClient: SecureMessagingVendorClient,
    @Inject(DIRECT_DELIVERY_CLIENT) private readonly directDeliveryClient: SecureMessagingVendorClient,
  ) {}

  async routeReferral(dto: RouteReferralDto, actor: ActorRef): Promise<RoutingAttemptRecord> {
    const prisma = this.prisma as unknown as SecureMessagingPrisma;
    const entry = await this.resolveDirectoryEntry(prisma, dto);

    const { method, vendor, endpointId, client } = this.pickRoute(entry);

    const attempt = await prisma.routingAttempt.create({
      data: {
        referralId: dto.referralId,
        directoryEntryId: entry.id,
        method,
        vendor,
        status: 'pending',
        attemptNumber: 1,
      },
    });

    return this.attemptDelivery(
      prisma,
      attempt,
      client,
      {
        referralId: dto.referralId,
        recipientEndpointId: endpointId,
        urgent: dto.urgent ?? false,
        summary: dto.summary,
      },
      actor,
    );
  }

  /** Retries a previously failed attempt — re-resolves the directory entry so a since-fixed endpoint/vendor config is picked up. */
  async retryAttempt(id: string, actor: ActorRef): Promise<RoutingAttemptRecord> {
    const prisma = this.prisma as unknown as SecureMessagingPrisma;
    const existing = await prisma.routingAttempt.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`RoutingAttempt ${id} not found`);
    }
    if (existing.status !== 'failed') {
      throw new BadRequestException(
        `RoutingAttempt ${id} is '${existing.status}' — only a failed attempt can be retried`,
      );
    }
    if (!existing.directoryEntryId) {
      throw new BadRequestException(`RoutingAttempt ${id} has no directoryEntryId to re-resolve for retry`);
    }

    const entry = await prisma.directoryEntry.findUnique({ where: { id: existing.directoryEntryId } });
    if (!entry) {
      throw new NotFoundException(`DirectoryEntry ${existing.directoryEntryId} no longer exists`);
    }
    const { method, vendor, endpointId, client } = this.pickRoute(entry);

    const attempt = await prisma.routingAttempt.update({
      where: { id },
      data: {
        method,
        vendor,
        status: 'pending',
        attemptNumber: existing.attemptNumber + 1,
        failureReason: null,
        resolvedAt: null,
      },
    });

    return this.attemptDelivery(
      prisma,
      attempt,
      client,
      {
        referralId: existing.referralId,
        recipientEndpointId: endpointId,
        urgent: false,
        summary: '(retry)',
      },
      actor,
    );
  }

  async getAttempt(id: string): Promise<RoutingAttemptRecord> {
    const prisma = this.prisma as unknown as SecureMessagingPrisma;
    const attempt = await prisma.routingAttempt.findUnique({ where: { id } });
    if (!attempt) {
      throw new NotFoundException(`RoutingAttempt ${id} not found`);
    }
    return attempt;
  }

  async listForReferral(referralId: string): Promise<RoutingAttemptRecord[]> {
    const prisma = this.prisma as unknown as SecureMessagingPrisma;
    return prisma.routingAttempt.findMany({ where: { referralId }, orderBy: { attemptedAt: 'asc' } });
  }

  private async resolveDirectoryEntry(
    prisma: SecureMessagingPrisma,
    dto: RouteReferralDto,
  ): Promise<DirectoryEntryLookup> {
    const entry = dto.directoryEntryId
      ? await prisma.directoryEntry.findUnique({ where: { id: dto.directoryEntryId } })
      : await prisma.directoryEntry.findUnique({ where: { hpiI: dto.hpiI } });
    if (!entry) {
      throw new NotFoundException(
        `No DirectoryEntry found for ${dto.directoryEntryId ? `id=${dto.directoryEntryId}` : `hpiI=${dto.hpiI}`}`,
      );
    }
    return entry;
  }

  private pickRoute(entry: DirectoryEntryLookup): {
    method: 'direct' | 'secure_messaging';
    vendor: string;
    endpointId: string;
    client: SecureMessagingVendorClient;
  } {
    if (entry.onboardedForDirectDelivery) {
      return {
        method: 'direct',
        vendor: 'direct_platform',
        endpointId: entry.secureMessagingEndpointId ?? entry.id,
        client: this.directDeliveryClient,
      };
    }

    const vendor =
      entry.secureMessagingVendor ?? this.config.get<string>('SECURE_MESSAGING_DEFAULT_VENDOR', 'healthlink');
    if (!entry.secureMessagingEndpointId) {
      throw new BadRequestException(
        `DirectoryEntry ${entry.id} is not onboarded for direct delivery and has no secureMessagingEndpointId configured — cannot route`,
      );
    }
    return {
      method: 'secure_messaging',
      vendor,
      endpointId: entry.secureMessagingEndpointId,
      client: vendor === 'medical_objects' ? this.medicalObjectsClient : this.healthLinkClient,
    };
  }

  private async attemptDelivery(
    prisma: SecureMessagingPrisma,
    attempt: RoutingAttemptRecord,
    client: SecureMessagingVendorClient,
    request: { referralId: string; recipientEndpointId: string; urgent: boolean; summary: string },
    actor: ActorRef,
  ): Promise<RoutingAttemptRecord> {
    try {
      const result = await client.send(request);
      return await prisma.$transaction(async (tx) => {
        const updated = await tx.routingAttempt.update({
          where: { id: attempt.id },
          data: { status: 'delivered', vendorMessageId: result.vendorMessageId, resolvedAt: new Date() },
        });
        await this.writeOutbox(tx, {
          type: 'referral.routed',
          actor,
          subjectType: 'Referral',
          subjectId: request.referralId,
          payload: {
            routingAttemptId: attempt.id,
            directoryEntryId: attempt.directoryEntryId,
            method: attempt.method,
            vendor: attempt.vendor,
            status: 'delivered',
            vendorMessageId: result.vendorMessageId,
          },
        });
        return updated;
      });
    } catch (err) {
      if (!(err instanceof SecureMessagingVendorError)) {
        throw err;
      }

      const failed = await prisma.$transaction(async (tx) => {
        const updated = await tx.routingAttempt.update({
          where: { id: attempt.id },
          data: { status: 'failed', failureReason: err.message, resolvedAt: new Date() },
        });
        await this.writeOutbox(tx, {
          type: 'referral.routed',
          actor,
          subjectType: 'Referral',
          subjectId: request.referralId,
          payload: {
            routingAttemptId: attempt.id,
            directoryEntryId: attempt.directoryEntryId,
            method: attempt.method,
            vendor: attempt.vendor,
            status: 'failed',
            failureReason: err.message,
          },
        });
        return updated;
      });

      // Best-effort — a Notification Service outage must never mask the
      // original delivery failure or block the exception below.
      await this.notifyDeliveryFailure(request.referralId, attempt.vendor ?? 'unknown', err.message);

      throw new SecureMessagingDeliveryException(
        request.referralId,
        attempt.vendor ?? 'unknown',
        failed.id,
        err.message,
      );
    }
  }

  /**
   * Dual-notification exception path — modules-and-requirements.md: "a
   * delivery failure must generate a dual-notification exception, per the
   * flow." The Notification Service (services/notification) is out of this
   * build's scope, so this is a best-effort plain HTTP call against its
   * documented (not-yet-built) API, per root CONVENTIONS.md §6 ("call the
   * target service's REST API directly with a plain fetch/axios call" for
   * anything short of the two dedicated shared clients). Failure here is
   * logged, never thrown — the caller already has a real
   * SecureMessagingDeliveryException to handle; this must not additionally
   * fail the request or hide that exception.
   */
  private async notifyDeliveryFailure(referralId: string, vendor: string, reason: string): Promise<void> {
    const url = this.config.get<string>('NOTIFICATION_SERVICE_URL');
    if (!url) {
      this.logger.warn('NOTIFICATION_SERVICE_URL not configured — skipping dual-notification exception call');
      return;
    }
    try {
      await fetch(`${url}/notifications/exceptions/secure-messaging-delivery-failed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ referralId, vendor, reason, occurredAt: new Date().toISOString() }),
      });
    } catch (err) {
      this.logger.error(
        `Failed to notify Notification Service of secure-messaging delivery failure for referral ${referralId} — the failure itself is still recorded/audited/thrown`,
        err instanceof Error ? err.stack : String(err),
      );
    }
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
