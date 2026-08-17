import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditOutboxService } from '../audit-outbox/audit-outbox.service';
import { NotificationService } from '../notifications/notification.service';
import type { CreateThreadDto } from './dto/create-thread.dto';
import type { AddParticipantDto } from './dto/add-participant.dto';

export interface ParticipantRow {
  id: string;
  threadId: string;
  principalType: string;
  principalId: string;
  displayName: string | null;
  joinedAt: Date;
}

export interface MessageRow {
  id: string;
  threadId: string;
  senderType: string;
  senderId: string;
  senderDisplayName: string | null;
  body: string;
  createdAt: Date;
}

export interface ThreadRow {
  id: string;
  referralId: string;
  subject: string | null;
  status: string;
  createdByType: string;
  createdById: string;
  resolvedAt: Date | null;
  resolvedByType: string | null;
  resolvedById: string | null;
  resolutionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  participants: ParticipantRow[];
  messages: MessageRow[];
}

/**
 * The referral-scoped secure message thread — the mechanism GP/patient(/
 * specialist) use to resolve exceptions, per
 * minors-multigp-exception-paths.md: "every referral gets its own secure,
 * in-app conversation ... keeps a complete record of how an exception was
 * resolved, feeding straight into the same signed audit log everything
 * else does." One thread per referral (see prisma/schema.prisma's unique
 * constraint) — created lazily on first use via `createOrGet`.
 *
 * DOCUMENTED ACCESS-CONTROL JUDGMENT CALL: this service does not itself
 * decide *which* patient/GP/specialist is allowed to see a given referral's
 * thread — it trusts the caller's authenticated `ActorRef` (verified by
 * `BearerAuthGuard`/`packages/auth-client`) and records who posted what.
 * The actual "may this GP see this patient's referral" / "has the patient
 * granted this specialist consent" decision belongs to the Consent &
 * Security Service and Referral Service (root CONVENTIONS.md §6: a service
 * never reads another service's schema directly, and this task's scope is
 * `services/notification` only) — a caller (typically the GP/specialist/
 * patient-web or mobile app, via its own backend-for-frontend call) is
 * expected to have already checked consent before letting a user open a
 * thread. `participants` IS enforced for one thing: only listed
 * participants receive the push notification fan-out on a new message
 * (see `postMessage`) — an unlisted actor can still post (auto-joins the
 * thread) since blocking a legitimate GP/patient/specialist from an
 * in-progress exception conversation because a race meant they weren't
 * pre-registered would be a worse failure mode than an extra participant
 * row. Tightening this to a hard allow-list is a follow-up once
 * consent-security's grant model is queryable from here.
 */
@Injectable()
export class MessageThreadService {
  private readonly logger = new Logger(MessageThreadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditOutbox: AuditOutboxService,
    private readonly notifications: NotificationService,
  ) {}

  async createOrGet(referralId: string, actor: ActorRef, dto: CreateThreadDto): Promise<ThreadRow> {
    const existing = await this.prisma.messageThread.findFirst({
      where: { referralId },
      include: { participants: true, messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (existing) {
      return existing as ThreadRow;
    }

    const participantInputs = dedupeParticipants([
      { principalType: actor.principalType, principalId: actor.id, displayName: actor.displayName ?? null },
      ...(dto.participants ?? []).map((p) => ({
        principalType: p.principalType,
        principalId: p.principalId,
        displayName: p.displayName ?? null,
      })),
    ]);

    const thread = await this.prisma.$transaction(async (tx) => {
      const created = await tx.messageThread.create({
        data: {
          referralId,
          subject: dto.subject ?? null,
          status: 'open',
          createdByType: actor.principalType,
          createdById: actor.id,
          participants: { create: participantInputs },
          ...(dto.initialMessage
            ? {
                messages: {
                  create: [
                    {
                      senderType: actor.principalType,
                      senderId: actor.id,
                      senderDisplayName: actor.displayName ?? null,
                      body: dto.initialMessage,
                    },
                  ],
                },
              }
            : {}),
        },
        include: { participants: true, messages: { orderBy: { createdAt: 'asc' } } },
      });

      await this.auditOutbox.enqueue(tx, {
        type: 'message_thread.created',
        actor,
        subject: { type: 'MessageThread', id: created.id },
        payload: { referralId, subject: dto.subject ?? null, participantCount: participantInputs.length },
      });

      return created;
    });

    if (dto.initialMessage) {
      await this.notifyOtherParticipants(thread as ThreadRow, actor, dto.initialMessage);
    }

    return thread as ThreadRow;
  }

  async getByReferralId(referralId: string): Promise<ThreadRow | null> {
    const thread = await this.prisma.messageThread.findFirst({
      where: { referralId },
      include: { participants: true, messages: { orderBy: { createdAt: 'asc' } } },
    });
    return thread as ThreadRow | null;
  }

  async getById(id: string): Promise<ThreadRow> {
    const thread = await this.prisma.messageThread.findUnique({
      where: { id },
      include: { participants: true, messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!thread) throw new NotFoundException(`Message thread ${id} not found`);
    return thread as ThreadRow;
  }

  async listMessages(threadId: string): Promise<MessageRow[]> {
    await this.getById(threadId); // 404s if missing
    return this.prisma.messageThreadMessage.findMany({ where: { threadId }, orderBy: { createdAt: 'asc' } });
  }

  async postMessage(threadId: string, actor: ActorRef, body: string): Promise<MessageRow> {
    const thread = await this.getById(threadId);

    const { message } = await this.prisma.$transaction(async (tx) => {
      await tx.messageThreadParticipant.upsert({
        where: {
          threadId_principalType_principalId: { threadId, principalType: actor.principalType, principalId: actor.id },
        },
        create: {
          threadId,
          principalType: actor.principalType,
          principalId: actor.id,
          displayName: actor.displayName ?? null,
        },
        update: {},
      });

      const created = await tx.messageThreadMessage.create({
        data: {
          threadId,
          senderType: actor.principalType,
          senderId: actor.id,
          senderDisplayName: actor.displayName ?? null,
          body,
        },
      });

      // A new message re-opens a thread that had been marked resolved —
      // a fresh exception on the same referral is common (documented
      // judgment call — see class doc comment for the pattern this
      // follows).
      if (thread.status === 'resolved') {
        await tx.messageThread.update({
          where: { id: threadId },
          data: { status: 'open', resolvedAt: null, resolvedByType: null, resolvedById: null, resolutionNote: null },
        });
      }

      await this.auditOutbox.enqueue(tx, {
        type: 'message_thread.message_posted',
        actor,
        subject: { type: 'MessageThread', id: threadId },
        payload: { referralId: thread.referralId, messageId: created.id },
      });

      return { message: created };
    });

    await this.notifyOtherParticipants(thread, actor, body);

    return message;
  }

  async addParticipant(threadId: string, actor: ActorRef, dto: AddParticipantDto): Promise<ParticipantRow> {
    await this.getById(threadId); // 404s if missing

    const { participant } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.messageThreadParticipant.upsert({
        where: {
          threadId_principalType_principalId: {
            threadId,
            principalType: dto.principalType,
            principalId: dto.principalId,
          },
        },
        create: {
          threadId,
          principalType: dto.principalType,
          principalId: dto.principalId,
          displayName: dto.displayName ?? null,
        },
        update: { displayName: dto.displayName ?? undefined },
      });

      await this.auditOutbox.enqueue(tx, {
        type: 'message_thread.participant_added',
        actor,
        subject: { type: 'MessageThread', id: threadId },
        payload: { principalType: dto.principalType, principalId: dto.principalId },
      });

      return { participant: created };
    });

    return participant;
  }

  async resolve(threadId: string, actor: ActorRef, note?: string): Promise<ThreadRow> {
    const thread = await this.getById(threadId);
    if (thread.status === 'resolved') {
      return thread; // idempotent — no duplicate audit entry
    }

    if (thread.status !== 'open') {
      throw new ConflictException(`Cannot resolve a thread in status "${thread.status}"`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.messageThread.update({
        where: { id: threadId },
        data: {
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedByType: actor.principalType,
          resolvedById: actor.id,
          resolutionNote: note ?? null,
        },
      });

      await this.auditOutbox.enqueue(tx, {
        type: 'message_thread.resolved',
        actor,
        subject: { type: 'MessageThread', id: threadId },
        payload: { referralId: thread.referralId, note: note ?? null },
      });
    });

    return this.getById(threadId);
  }

  /**
   * Push (with no configured fallback — a message-thread notification is
   * "come read the thread", not itself the sensitive content, so
   * push-only is sufficient; the full push→email/SMS fallback pattern is
   * for the underlying exception events themselves, dispatched by the
   * owning service e.g. Referral Service, not by every message).
   */
  private async notifyOtherParticipants(thread: ThreadRow, sender: ActorRef, body: string): Promise<void> {
    const others = thread.participants.filter(
      (p) => !(p.principalType === sender.principalType && p.principalId === sender.id),
    );
    for (const participant of others) {
      try {
        await this.notifications.sendPush({
          recipientType: participant.principalType,
          recipientId: participant.principalId,
          eventType: 'message_thread.message_posted',
          title: 'New message on your referral',
          body: body.length > 140 ? `${body.slice(0, 137)}...` : body,
          data: { referralId: thread.referralId, threadId: thread.id, action: 'open_message_thread' },
          referralId: thread.referralId,
        });
      } catch (err) {
        this.logger.warn(
          `Failed to notify participant ${participant.principalId} of new thread message: ${(err as Error).message}`,
        );
      }
    }
  }
}

function dedupeParticipants<T extends { principalType: string; principalId: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const p of list) {
    const key = `${p.principalType}:${p.principalId}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}
