import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PushProvider } from './providers/push-provider';
import { SmsProvider } from './providers/sms-provider';
import { EmailService } from './email.service';
import type { RegisterDeviceDto } from './dto/register-device.dto';
import type { SendPushDto } from './dto/send-push.dto';
import type { SendSmsDto } from './dto/send-sms.dto';
import type { SendEmailDto } from './dto/send-email.dto';
import type { DispatchNotificationDto } from './dto/dispatch-notification.dto';
import type { ListNotificationsQueryDto } from './dto/list-notifications.query.dto';

export type NotificationChannel = 'push' | 'sms' | 'email';
export type NotificationStatus = 'sent' | 'failed' | 'skipped';

export interface NotificationLogRow {
  id: string;
  channel: string;
  eventType: string;
  recipientType: string;
  recipientId: string;
  recipientAddress: string | null;
  title: string | null;
  body: string;
  data: unknown;
  provider: string;
  status: string;
  providerMessageId: string | null;
  error: string | null;
  dispatchGroupId: string | null;
  attemptSequence: number;
  referralId: string | null;
  createdAt: Date;
}

/**
 * Push/SMS/email fan-out — module #13 of modules-and-requirements.md.
 * "push as the primary channel for time-sensitive events ... SMS/email as
 * fallback for users without the app installed or without notifications
 * enabled." Every send — mock or real — produces a `NotificationLog` row so
 * other services/tests can assert on delivery; this table is deliberately
 * NOT audit-logged (see prisma/schema.prisma's doc comment) since routine
 * delivery is high-volume and not clinical/consent-relevant in itself.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushProvider: PushProvider,
    private readonly smsProvider: SmsProvider,
    private readonly emailService: EmailService,
  ) {}

  // ---------------------------------------------------------------------
  // Device registration
  // ---------------------------------------------------------------------

  async registerDevice(dto: RegisterDeviceDto) {
    return this.prisma.pushDeviceToken.upsert({
      where: { token: dto.token },
      create: {
        principalType: dto.recipientType,
        principalId: dto.recipientId,
        token: dto.token,
        platform: dto.platform,
        active: true,
      },
      update: {
        principalType: dto.recipientType,
        principalId: dto.recipientId,
        platform: dto.platform,
        active: true,
      },
    });
  }

  async deactivateDevice(token: string): Promise<void> {
    await this.prisma.pushDeviceToken.updateMany({ where: { token }, data: { active: false } });
  }

  // ---------------------------------------------------------------------
  // Single-channel sends
  // ---------------------------------------------------------------------

  /**
   * Sends to every active device registered for the recipient. Returns one
   * NotificationLog row per device — a `skipped` row (no `recipientAddress`)
   * if the recipient has no active device, so callers (and `dispatch()`)
   * can tell "no device to push to" apart from "push provider errored".
   */
  async sendPush(dto: SendPushDto, dispatchGroupId?: string, attemptSequence = 1): Promise<NotificationLogRow[]> {
    const devices = await this.prisma.pushDeviceToken.findMany({
      where: { principalType: dto.recipientType, principalId: dto.recipientId, active: true },
    });

    if (devices.length === 0) {
      const row = await this.writeLog({
        channel: 'push',
        eventType: dto.eventType,
        recipientType: dto.recipientType,
        recipientId: dto.recipientId,
        recipientAddress: null,
        title: dto.title,
        body: dto.body,
        data: dto.data ?? null,
        provider: 'mock-push',
        status: 'skipped',
        providerMessageId: null,
        error: 'No active registered device for this recipient',
        dispatchGroupId: dispatchGroupId ?? null,
        attemptSequence,
        referralId: dto.referralId ?? null,
      });
      return [row];
    }

    const rows: NotificationLogRow[] = [];
    for (const device of devices) {
      try {
        const result = await this.pushProvider.send({
          token: device.token,
          title: dto.title,
          body: dto.body,
          data: dto.data,
        });
        rows.push(
          await this.writeLog({
            channel: 'push',
            eventType: dto.eventType,
            recipientType: dto.recipientType,
            recipientId: dto.recipientId,
            recipientAddress: device.token,
            title: dto.title,
            body: dto.body,
            data: dto.data ?? null,
            provider: 'mock-push',
            status: 'sent',
            providerMessageId: result.providerMessageId,
            error: null,
            dispatchGroupId: dispatchGroupId ?? null,
            attemptSequence,
            referralId: dto.referralId ?? null,
          }),
        );
      } catch (err) {
        this.logger.warn(`Push send failed for device ${device.id}: ${(err as Error).message}`);
        rows.push(
          await this.writeLog({
            channel: 'push',
            eventType: dto.eventType,
            recipientType: dto.recipientType,
            recipientId: dto.recipientId,
            recipientAddress: device.token,
            title: dto.title,
            body: dto.body,
            data: dto.data ?? null,
            provider: 'mock-push',
            status: 'failed',
            providerMessageId: null,
            error: (err as Error).message,
            dispatchGroupId: dispatchGroupId ?? null,
            attemptSequence,
            referralId: dto.referralId ?? null,
          }),
        );
      }
    }
    return rows;
  }

  async sendSms(dto: SendSmsDto, dispatchGroupId?: string, attemptSequence = 1): Promise<NotificationLogRow> {
    try {
      const result = await this.smsProvider.send({ to: dto.phoneNumber, message: dto.message });
      return this.writeLog({
        channel: 'sms',
        eventType: dto.eventType,
        recipientType: dto.recipientType,
        recipientId: dto.recipientId,
        recipientAddress: dto.phoneNumber,
        title: null,
        body: dto.message,
        data: null,
        provider: 'mock-sms',
        status: 'sent',
        providerMessageId: result.providerMessageId,
        error: null,
        dispatchGroupId: dispatchGroupId ?? null,
        attemptSequence,
        referralId: dto.referralId ?? null,
      });
    } catch (err) {
      return this.writeLog({
        channel: 'sms',
        eventType: dto.eventType,
        recipientType: dto.recipientType,
        recipientId: dto.recipientId,
        recipientAddress: dto.phoneNumber,
        title: null,
        body: dto.message,
        data: null,
        provider: 'mock-sms',
        status: 'failed',
        providerMessageId: null,
        error: (err as Error).message,
        dispatchGroupId: dispatchGroupId ?? null,
        attemptSequence,
        referralId: dto.referralId ?? null,
      });
    }
  }

  async sendEmail(dto: SendEmailDto, dispatchGroupId?: string, attemptSequence = 1): Promise<NotificationLogRow> {
    try {
      const result = await this.emailService.send({ to: dto.to, subject: dto.subject, text: dto.text, html: dto.html });
      return this.writeLog({
        channel: 'email',
        eventType: dto.eventType,
        recipientType: dto.recipientType,
        recipientId: dto.recipientId,
        recipientAddress: dto.to,
        title: dto.subject,
        body: dto.text,
        data: null,
        provider: 'smtp-mailhog',
        status: 'sent',
        providerMessageId: result.providerMessageId,
        error: null,
        dispatchGroupId: dispatchGroupId ?? null,
        attemptSequence,
        referralId: dto.referralId ?? null,
      });
    } catch (err) {
      return this.writeLog({
        channel: 'email',
        eventType: dto.eventType,
        recipientType: dto.recipientType,
        recipientId: dto.recipientId,
        recipientAddress: dto.to,
        title: dto.subject,
        body: dto.text,
        data: null,
        provider: 'smtp-mailhog',
        status: 'failed',
        providerMessageId: null,
        error: (err as Error).message,
        dispatchGroupId: dispatchGroupId ?? null,
        attemptSequence,
        referralId: dto.referralId ?? null,
      });
    }
  }

  // ---------------------------------------------------------------------
  // Fan-out with fallback — push primary, email/SMS fallback
  // ---------------------------------------------------------------------

  async dispatch(dto: DispatchNotificationDto): Promise<{ dispatchGroupId: string; attempts: NotificationLogRow[] }> {
    const dispatchGroupId = randomUUID();
    const attempts: NotificationLogRow[] = [];

    const pushRows = await this.sendPush(
      {
        recipientType: dto.recipientType,
        recipientId: dto.recipientId,
        eventType: dto.eventType,
        title: dto.title,
        body: dto.body,
        data: dto.data,
        referralId: dto.referralId,
      },
      dispatchGroupId,
      1,
    );
    attempts.push(...pushRows);
    const pushSucceeded = pushRows.some((r) => r.status === 'sent');

    if (pushSucceeded || !dto.fallbackChannels?.length) {
      return { dispatchGroupId, attempts };
    }

    let sequence = 2;
    for (const channel of dto.fallbackChannels) {
      let row: NotificationLogRow | undefined;
      if (channel === 'email' && dto.email) {
        row = await this.sendEmail(
          {
            recipientType: dto.recipientType,
            recipientId: dto.recipientId,
            eventType: dto.eventType,
            to: dto.email.to,
            subject: dto.email.subject,
            text: dto.email.text,
            html: dto.email.html,
            referralId: dto.referralId,
          },
          dispatchGroupId,
          sequence,
        );
      } else if (channel === 'sms' && dto.sms) {
        row = await this.sendSms(
          {
            recipientType: dto.recipientType,
            recipientId: dto.recipientId,
            eventType: dto.eventType,
            phoneNumber: dto.sms.phoneNumber,
            message: dto.sms.message,
            referralId: dto.referralId,
          },
          dispatchGroupId,
          sequence,
        );
      }
      if (row) {
        attempts.push(row);
        sequence += 1;
        if (row.status === 'sent') {
          break; // fallback succeeded — stop trying further channels
        }
      }
    }

    return { dispatchGroupId, attempts };
  }

  // ---------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------

  async list(query: ListNotificationsQueryDto): Promise<NotificationLogRow[]> {
    return this.prisma.notificationLog.findMany({
      where: {
        ...(query.channel ? { channel: query.channel } : {}),
        ...(query.recipientType ? { recipientType: query.recipientType } : {}),
        ...(query.recipientId ? { recipientId: query.recipientId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.eventType ? { eventType: query.eventType } : {}),
        ...(query.referralId ? { referralId: query.referralId } : {}),
        ...(query.dispatchGroupId ? { dispatchGroupId: query.dispatchGroupId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string): Promise<NotificationLogRow> {
    const row = await this.prisma.notificationLog.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Notification log ${id} not found`);
    return row;
  }

  private async writeLog(data: Omit<NotificationLogRow, 'id' | 'createdAt'>): Promise<NotificationLogRow> {
    return this.prisma.notificationLog.create({ data });
  }
}
