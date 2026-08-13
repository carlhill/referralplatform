import { NotFoundException } from '@nestjs/common';
import { NotificationService, type NotificationLogRow } from './notification.service';
import { PushProvider } from './providers/push-provider';
import { SmsProvider } from './providers/sms-provider';
import { EmailService } from './email.service';

/**
 * A small hand-rolled fake standing in for PrismaService, shaped exactly
 * like the calls NotificationService actually makes — same pattern as
 * services/referral/src/referral/referral.service.spec.ts's FakePrisma
 * (necessary here too since the real generated Prisma client can't be
 * produced in this sandbox — see test/stubs/prisma-client.stub.ts).
 */
class FakePrisma {
  devices = new Map<string, any>();
  logs = new Map<string, NotificationLogRow>();
  private counter = 0;

  pushDeviceToken = {
    upsert: async ({ where, create, update }: { where: { token: string }; create: any; update: any }) => {
      const existing = [...this.devices.values()].find((d) => d.token === where.token);
      if (existing) {
        const updated = { ...existing, ...update };
        this.devices.set(existing.id, updated);
        return updated;
      }
      const id = `device-${++this.counter}`;
      const record = { id, active: true, createdAt: new Date(), updatedAt: new Date(), ...create };
      this.devices.set(id, record);
      return record;
    },
    updateMany: async ({ where, data }: { where: { token: string }; data: any }) => {
      let count = 0;
      for (const [id, d] of this.devices) {
        if (d.token === where.token) {
          this.devices.set(id, { ...d, ...data });
          count++;
        }
      }
      return { count };
    },
    findMany: async ({ where }: { where: { principalType: string; principalId: string; active: boolean } }) =>
      [...this.devices.values()].filter(
        (d) =>
          d.principalType === where.principalType && d.principalId === where.principalId && d.active === where.active,
      ),
  };

  notificationLog = {
    create: async ({ data }: { data: Omit<NotificationLogRow, 'id' | 'createdAt'> }) => {
      const id = `log-${++this.counter}`;
      const row = { id, createdAt: new Date(), ...data } as NotificationLogRow;
      this.logs.set(id, row);
      return row;
    },
    findMany: async ({ where }: { where: Record<string, unknown> }) => {
      return [...this.logs.values()]
        .filter((row) => Object.entries(where).every(([k, v]) => (row as any)[k] === v))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    findUnique: async ({ where }: { where: { id: string } }) => this.logs.get(where.id) ?? null,
  };
}

class FakePushProvider extends PushProvider {
  send = jest.fn().mockResolvedValue({ providerMessageId: 'push-1' });
}
class FakeSmsProvider extends SmsProvider {
  send = jest.fn().mockResolvedValue({ providerMessageId: 'sms-1' });
}

function makeService() {
  const prisma = new FakePrisma();
  const push = new FakePushProvider();
  const sms = new FakeSmsProvider();
  const email = { send: jest.fn().mockResolvedValue({ providerMessageId: 'email-1' }) } as unknown as EmailService;
  const service = new NotificationService(prisma as any, push, sms, email);
  return { service, prisma, push, sms, email };
}

describe('NotificationService', () => {
  describe('push', () => {
    it('logs a skipped row when the recipient has no registered device', async () => {
      const { service } = makeService();
      const rows = await service.sendPush({
        recipientType: 'patient',
        recipientId: 'p1',
        eventType: 'referral.declined',
        title: 'Referral update',
        body: 'Your GP has been notified',
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('skipped');
      expect(rows[0].recipientAddress).toBeNull();
    });

    it('sends to every active registered device and logs one row per device', async () => {
      const { service, prisma, push } = makeService();
      await prisma.pushDeviceToken.upsert({
        where: { token: 'dev-1' },
        create: { principalType: 'patient', principalId: 'p1', token: 'dev-1', platform: 'ios' },
        update: {},
      });
      await prisma.pushDeviceToken.upsert({
        where: { token: 'dev-2' },
        create: { principalType: 'patient', principalId: 'p1', token: 'dev-2', platform: 'android' },
        update: {},
      });

      const rows = await service.sendPush({
        recipientType: 'patient',
        recipientId: 'p1',
        eventType: 'referral.declined',
        title: 'Referral update',
        body: 'Body',
      });

      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.status === 'sent')).toBe(true);
      expect(push.send).toHaveBeenCalledTimes(2);
    });

    it('does not push to a deactivated device', async () => {
      const { service, prisma } = makeService();
      await prisma.pushDeviceToken.upsert({
        where: { token: 'dev-1' },
        create: { principalType: 'patient', principalId: 'p1', token: 'dev-1', platform: 'ios' },
        update: {},
      });
      await service.deactivateDevice('dev-1');

      const rows = await service.sendPush({
        recipientType: 'patient',
        recipientId: 'p1',
        eventType: 'x',
        title: 't',
        body: 'b',
      });
      expect(rows[0].status).toBe('skipped');
    });

    it('logs a failed row (not throwing) when the push provider errors', async () => {
      const { service, prisma, push } = makeService();
      await prisma.pushDeviceToken.upsert({
        where: { token: 'dev-1' },
        create: { principalType: 'patient', principalId: 'p1', token: 'dev-1', platform: 'ios' },
        update: {},
      });
      push.send.mockRejectedValueOnce(new Error('provider down'));

      const rows = await service.sendPush({
        recipientType: 'patient',
        recipientId: 'p1',
        eventType: 'x',
        title: 't',
        body: 'b',
      });
      expect(rows[0].status).toBe('failed');
      expect(rows[0].error).toContain('provider down');
    });
  });

  describe('sms', () => {
    it('sends via the SMS provider and logs a sent row', async () => {
      const { service, sms } = makeService();
      const row = await service.sendSms({
        recipientType: 'patient',
        recipientId: 'p1',
        eventType: 'account.otp.issued',
        phoneNumber: '+61412345678',
        message: 'Your code is 1234',
      });
      expect(row.status).toBe('sent');
      expect(row.channel).toBe('sms');
      expect(sms.send).toHaveBeenCalledWith({ to: '+61412345678', message: 'Your code is 1234' });
    });

    it('logs a failed row when the SMS provider errors', async () => {
      const { service, sms } = makeService();
      sms.send.mockRejectedValueOnce(new Error('vendor timeout'));
      const row = await service.sendSms({
        recipientType: 'patient',
        recipientId: 'p1',
        eventType: 'x',
        phoneNumber: '+61412345678',
        message: 'm',
      });
      expect(row.status).toBe('failed');
    });
  });

  describe('email', () => {
    it('sends via EmailService (real SMTP/Mailhog) and logs a sent row', async () => {
      const { service, email } = makeService();
      const row = await service.sendEmail({
        recipientType: 'patient',
        recipientId: 'p1',
        eventType: 'account.otp.issued',
        to: 'patient@example.com',
        subject: 'Your code',
        text: 'Your code is 1234',
      });
      expect(row.status).toBe('sent');
      expect(row.channel).toBe('email');
      expect(email.send).toHaveBeenCalled();
    });
  });

  describe('dispatch — push primary, fallback on failure', () => {
    it('does not attempt fallback when push succeeds', async () => {
      const { service, prisma, sms, email } = makeService();
      await prisma.pushDeviceToken.upsert({
        where: { token: 'dev-1' },
        create: { principalType: 'patient', principalId: 'p1', token: 'dev-1', platform: 'ios' },
        update: {},
      });

      const result = await service.dispatch({
        recipientType: 'patient',
        recipientId: 'p1',
        eventType: 'referral.declined',
        title: 'Update',
        body: 'Body',
        fallbackChannels: ['email', 'sms'],
        email: { to: 'p@example.com', subject: 's', text: 't' },
        sms: { phoneNumber: '+61412345678', message: 'm' },
      });

      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].status).toBe('sent');
      expect(email.send).not.toHaveBeenCalled();
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('falls back to email when push has no registered device', async () => {
      const { service, email } = makeService();
      const result = await service.dispatch({
        recipientType: 'patient',
        recipientId: 'p1',
        eventType: 'referral.declined',
        title: 'Update',
        body: 'Body',
        fallbackChannels: ['email', 'sms'],
        email: { to: 'p@example.com', subject: 's', text: 't' },
      });

      expect(result.attempts).toHaveLength(2);
      expect(result.attempts[0].channel).toBe('push');
      expect(result.attempts[0].status).toBe('skipped');
      expect(result.attempts[1].channel).toBe('email');
      expect(result.attempts[1].status).toBe('sent');
      expect(email.send).toHaveBeenCalledTimes(1);
    });

    it('falls through to SMS when email fallback also fails, all sharing one dispatchGroupId', async () => {
      const { service, email, sms } = makeService();
      (email.send as jest.Mock).mockRejectedValueOnce(new Error('smtp down'));

      const result = await service.dispatch({
        recipientType: 'patient',
        recipientId: 'p1',
        eventType: 'referral.declined',
        title: 'Update',
        body: 'Body',
        fallbackChannels: ['email', 'sms'],
        email: { to: 'p@example.com', subject: 's', text: 't' },
        sms: { phoneNumber: '+61412345678', message: 'm' },
      });

      expect(result.attempts.map((a) => a.channel)).toEqual(['push', 'email', 'sms']);
      expect(result.attempts.map((a) => a.status)).toEqual(['skipped', 'failed', 'sent']);
      const groupIds = new Set(result.attempts.map((a) => a.dispatchGroupId));
      expect(groupIds.size).toBe(1);
      expect(sms.send).toHaveBeenCalledTimes(1);
    });

    it('does not attempt any fallback channel when none is configured', async () => {
      const { service } = makeService();
      const result = await service.dispatch({
        recipientType: 'patient',
        recipientId: 'p1',
        eventType: 'referral.declined',
        title: 'Update',
        body: 'Body',
      });
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].status).toBe('skipped');
    });
  });

  describe('list / getById', () => {
    it('filters logs by recipientId and channel', async () => {
      const { service, prisma } = makeService();
      await service.sendSms({
        recipientType: 'patient',
        recipientId: 'p1',
        eventType: 'x',
        phoneNumber: '+61412345678',
        message: 'm',
      });
      await service.sendSms({
        recipientType: 'patient',
        recipientId: 'p2',
        eventType: 'x',
        phoneNumber: '+61412345679',
        message: 'm',
      });

      const forP1 = await service.list({ recipientId: 'p1' } as any);
      expect(forP1).toHaveLength(1);
      const smsLogs = await service.list({ channel: 'sms' } as any);
      expect(smsLogs).toHaveLength(2);
      expect(prisma.logs.size).toBe(2);
    });

    it('getById throws NotFoundException for an unknown id', async () => {
      const { service } = makeService();
      await expect(service.getById('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
