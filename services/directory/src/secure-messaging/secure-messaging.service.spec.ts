import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { SecureMessagingService, type RoutingAttemptRecord } from './secure-messaging.service';
import { SecureMessagingDeliveryException } from './exceptions/secure-messaging-delivery.exception';
import { SecureMessagingVendorError } from './vendors/vendor-error';
import type {
  SecureMessageSendRequest,
  SecureMessageSendResult,
  SecureMessagingVendorClient,
} from './vendors/vendor-client.interface';

const ACTOR: ActorRef = { principalType: 'system', id: 'referral-service' };

interface FakeDirectoryEntry {
  id: string;
  hpiI: string | null;
  onboardedForDirectDelivery: boolean;
  secureMessagingVendor: string | null;
  secureMessagingEndpointId: string | null;
}

/** Hand-rolled fake standing in for the RoutingAttempt/DirectoryEntry/AuditOutbox slice of PrismaService, incl. `$transaction`. */
class FakePrisma {
  entries = new Map<string, FakeDirectoryEntry>();
  attempts = new Map<string, RoutingAttemptRecord>();
  outbox: Array<{
    type: string;
    actor: ActorRef;
    subjectType: string;
    subjectId: string;
    payload: Record<string, unknown>;
  }> = [];
  private counter = 0;

  directoryEntry = {
    findUnique: async ({ where }: any): Promise<FakeDirectoryEntry | null> => {
      if (where.id) return this.entries.get(where.id) ?? null;
      if (where.hpiI) return [...this.entries.values()].find((e) => e.hpiI === where.hpiI) ?? null;
      return null;
    },
  };

  routingAttempt = {
    create: async ({ data }: any): Promise<RoutingAttemptRecord> => {
      const attempt: RoutingAttemptRecord = {
        id: `attempt-${++this.counter}`,
        referralId: data.referralId,
        directoryEntryId: data.directoryEntryId ?? null,
        method: data.method,
        vendor: data.vendor ?? null,
        status: data.status ?? 'pending',
        attemptNumber: data.attemptNumber ?? 1,
        failureReason: null,
        vendorMessageId: null,
        attemptedAt: new Date(),
        resolvedAt: null,
      };
      this.attempts.set(attempt.id, attempt);
      return attempt;
    },
    update: async ({ where, data }: any): Promise<RoutingAttemptRecord> => {
      const attempt = this.attempts.get(where.id)!;
      Object.assign(attempt, data);
      return attempt;
    },
    findUnique: async ({ where }: any): Promise<RoutingAttemptRecord | null> => this.attempts.get(where.id) ?? null,
    findMany: async ({ where }: any): Promise<RoutingAttemptRecord[]> =>
      [...this.attempts.values()].filter((a) => a.referralId === where.referralId),
  };

  auditOutbox = {
    create: async ({ data }: any) => {
      this.outbox.push(data);
      return data;
    },
  };

  $transaction = async <T>(fn: (tx: this) => Promise<T>): Promise<T> => fn(this);
}

class FakeConfigService {
  constructor(private readonly values: Record<string, string> = {}) {}
  get<T>(key: string, defaultValue?: T): T {
    return (this.values[key] as unknown as T) ?? (defaultValue as T);
  }
}

class ScriptedVendorClient implements SecureMessagingVendorClient {
  readonly vendorName: string;
  private readonly behaviour: 'succeed' | 'fail';
  calls: SecureMessageSendRequest[] = [];

  constructor(vendorName: string, behaviour: 'succeed' | 'fail' = 'succeed') {
    this.vendorName = vendorName;
    this.behaviour = behaviour;
  }

  async send(request: SecureMessageSendRequest): Promise<SecureMessageSendResult> {
    this.calls.push(request);
    if (this.behaviour === 'fail') {
      throw new SecureMessagingVendorError(this.vendorName, `${this.vendorName} rejected delivery (scripted failure)`);
    }
    return { vendorMessageId: `${this.vendorName.toUpperCase()}-MSG-1`, status: 'accepted' };
  }
}

describe('SecureMessagingService', () => {
  let prisma: FakePrisma;
  let healthLink: ScriptedVendorClient;
  let medicalObjects: ScriptedVendorClient;
  let direct: ScriptedVendorClient;
  let service: SecureMessagingService;

  beforeEach(() => {
    prisma = new FakePrisma();
    healthLink = new ScriptedVendorClient('healthlink');
    medicalObjects = new ScriptedVendorClient('medical_objects');
    direct = new ScriptedVendorClient('direct_platform');
    service = new SecureMessagingService(
      prisma as any,
      new FakeConfigService() as any,
      healthLink,
      medicalObjects,
      direct,
    );
  });

  describe('routeReferral', () => {
    it('routes via secure messaging (healthlink) when the specialist is not onboarded for direct delivery', async () => {
      prisma.entries.set('entry-1', {
        id: 'entry-1',
        hpiI: '8003611111111111',
        onboardedForDirectDelivery: false,
        secureMessagingVendor: 'healthlink',
        secureMessagingEndpointId: 'HL-BOX-1',
      });

      const result = await service.routeReferral(
        { referralId: 'ref-1', directoryEntryId: 'entry-1', summary: 'Cardiology referral' } as any,
        ACTOR,
      );

      expect(result.method).toBe('secure_messaging');
      expect(result.vendor).toBe('healthlink');
      expect(result.status).toBe('delivered');
      expect(result.vendorMessageId).toBe('HEALTHLINK-MSG-1');
      expect(healthLink.calls).toHaveLength(1);
      expect(medicalObjects.calls).toHaveLength(0);
    });

    it('routes via medical_objects when that is the entry’s configured vendor', async () => {
      prisma.entries.set('entry-2', {
        id: 'entry-2',
        hpiI: null,
        onboardedForDirectDelivery: false,
        secureMessagingVendor: 'medical_objects',
        secureMessagingEndpointId: 'MO-BOX-1',
      });

      const result = await service.routeReferral(
        { referralId: 'ref-2', directoryEntryId: 'entry-2', summary: 'Derm referral' } as any,
        ACTOR,
      );

      expect(result.vendor).toBe('medical_objects');
      expect(medicalObjects.calls).toHaveLength(1);
    });

    it('routes directly when the specialist is onboarded for direct platform delivery', async () => {
      prisma.entries.set('entry-3', {
        id: 'entry-3',
        hpiI: '8003613333333333',
        onboardedForDirectDelivery: true,
        secureMessagingVendor: null,
        secureMessagingEndpointId: null,
      });

      const result = await service.routeReferral(
        { referralId: 'ref-3', hpiI: '8003613333333333', summary: 'Neuro referral' } as any,
        ACTOR,
      );

      expect(result.method).toBe('direct');
      expect(result.vendor).toBe('direct_platform');
      expect(result.status).toBe('delivered');
      expect(direct.calls).toHaveLength(1);
    });

    it('writes a referral.routed audit outbox row on successful delivery', async () => {
      prisma.entries.set('entry-1', {
        id: 'entry-1',
        hpiI: null,
        onboardedForDirectDelivery: false,
        secureMessagingVendor: 'healthlink',
        secureMessagingEndpointId: 'HL-BOX-1',
      });

      await service.routeReferral({ referralId: 'ref-1', directoryEntryId: 'entry-1', summary: 'x' } as any, ACTOR);

      expect(prisma.outbox).toHaveLength(1);
      expect(prisma.outbox[0].type).toBe('referral.routed');
      expect(prisma.outbox[0].payload.status).toBe('delivered');
      expect(prisma.outbox[0].subjectId).toBe('ref-1');
    });

    it('throws NotFoundException when the DirectoryEntry cannot be resolved', async () => {
      await expect(
        service.routeReferral({ referralId: 'ref-x', directoryEntryId: 'missing', summary: 'x' } as any, ACTOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when not onboarded for direct delivery and no secure messaging endpoint is configured', async () => {
      prisma.entries.set('entry-4', {
        id: 'entry-4',
        hpiI: null,
        onboardedForDirectDelivery: false,
        secureMessagingVendor: 'healthlink',
        secureMessagingEndpointId: null,
      });
      await expect(
        service.routeReferral({ referralId: 'ref-4', directoryEntryId: 'entry-4', summary: 'x' } as any, ACTOR),
      ).rejects.toThrow(BadRequestException);
    });

    it('does NOT silently fail on vendor delivery failure — records the failure, audits it, and throws SecureMessagingDeliveryException', async () => {
      medicalObjects = new ScriptedVendorClient('medical_objects', 'fail');
      service = new SecureMessagingService(
        prisma as any,
        new FakeConfigService() as any,
        healthLink,
        medicalObjects,
        direct,
      );
      prisma.entries.set('entry-5', {
        id: 'entry-5',
        hpiI: null,
        onboardedForDirectDelivery: false,
        secureMessagingVendor: 'medical_objects',
        secureMessagingEndpointId: 'MO-BOX-FAIL',
      });

      await expect(
        service.routeReferral({ referralId: 'ref-5', directoryEntryId: 'entry-5', summary: 'x' } as any, ACTOR),
      ).rejects.toThrow(SecureMessagingDeliveryException);

      const attempt = [...prisma.attempts.values()][0];
      expect(attempt.status).toBe('failed');
      expect(attempt.failureReason).toContain('scripted failure');

      expect(prisma.outbox).toHaveLength(1);
      expect(prisma.outbox[0].payload.status).toBe('failed');
    });

    it('best-effort notifies the Notification Service on failure without masking the original exception when that call itself fails', async () => {
      const failingFetch = jest.fn().mockRejectedValue(new Error('network down'));
      (global as any).fetch = failingFetch;

      medicalObjects = new ScriptedVendorClient('medical_objects', 'fail');
      service = new SecureMessagingService(
        prisma as any,
        new FakeConfigService({ NOTIFICATION_SERVICE_URL: 'http://notification:3010' }) as any,
        healthLink,
        medicalObjects,
        direct,
      );
      prisma.entries.set('entry-6', {
        id: 'entry-6',
        hpiI: null,
        onboardedForDirectDelivery: false,
        secureMessagingVendor: 'medical_objects',
        secureMessagingEndpointId: 'MO-BOX-FAIL',
      });

      await expect(
        service.routeReferral({ referralId: 'ref-6', directoryEntryId: 'entry-6', summary: 'x' } as any, ACTOR),
      ).rejects.toThrow(SecureMessagingDeliveryException);

      expect(failingFetch).toHaveBeenCalledWith(
        'http://notification:3010/notifications/exceptions/secure-messaging-delivery-failed',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('retryAttempt', () => {
    it('retries a failed attempt and succeeds once the underlying issue is resolved', async () => {
      prisma.entries.set('entry-7', {
        id: 'entry-7',
        hpiI: null,
        onboardedForDirectDelivery: false,
        secureMessagingVendor: 'healthlink',
        secureMessagingEndpointId: 'HL-BOX-INITIALLY-FAILS',
      });
      healthLink = new ScriptedVendorClient('healthlink', 'fail');
      service = new SecureMessagingService(
        prisma as any,
        new FakeConfigService() as any,
        healthLink,
        medicalObjects,
        direct,
      );

      await expect(
        service.routeReferral({ referralId: 'ref-7', directoryEntryId: 'entry-7', summary: 'x' } as any, ACTOR),
      ).rejects.toThrow(SecureMessagingDeliveryException);
      const failedAttemptId = [...prisma.attempts.values()][0].id;

      // "fix" the vendor for the retry
      healthLink = new ScriptedVendorClient('healthlink', 'succeed');
      service = new SecureMessagingService(
        prisma as any,
        new FakeConfigService() as any,
        healthLink,
        medicalObjects,
        direct,
      );

      const retried = await service.retryAttempt(failedAttemptId, ACTOR);
      expect(retried.status).toBe('delivered');
      expect(retried.attemptNumber).toBe(2);
    });

    it('rejects retrying an attempt that is not currently failed', async () => {
      prisma.entries.set('entry-8', {
        id: 'entry-8',
        hpiI: null,
        onboardedForDirectDelivery: false,
        secureMessagingVendor: 'healthlink',
        secureMessagingEndpointId: 'HL-BOX-OK',
      });
      const delivered = await service.routeReferral(
        { referralId: 'ref-8', directoryEntryId: 'entry-8', summary: 'x' } as any,
        ACTOR,
      );
      await expect(service.retryAttempt(delivered.id, ACTOR)).rejects.toThrow(BadRequestException);
    });
  });

  describe('listForReferral / getAttempt', () => {
    it('lists all attempts for a referral', async () => {
      prisma.entries.set('entry-9', {
        id: 'entry-9',
        hpiI: null,
        onboardedForDirectDelivery: false,
        secureMessagingVendor: 'healthlink',
        secureMessagingEndpointId: 'HL-BOX-OK',
      });
      await service.routeReferral({ referralId: 'ref-9', directoryEntryId: 'entry-9', summary: 'x' } as any, ACTOR);
      const attempts = await service.listForReferral('ref-9');
      expect(attempts).toHaveLength(1);
    });

    it('throws NotFoundException for an unknown attempt id', async () => {
      await expect(service.getAttempt('nope')).rejects.toThrow(NotFoundException);
    });
  });
});
