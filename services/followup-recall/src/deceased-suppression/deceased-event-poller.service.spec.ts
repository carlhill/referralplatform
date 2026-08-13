import { DeceasedEventPollerService } from './deceased-event-poller.service';
import type { ConsentSecurityClient, PublishedDeceasedEvent } from '../common/consent-security.client';
import type { DeceasedSuppressionService } from './deceased-suppression.service';

class FakeCursorPrisma {
  cursor: { id: string; lastPolledAt: Date | null } | null = null;

  eventPollCursor = {
    findUnique: async () => this.cursor,
    upsert: async ({
      create,
      update,
    }: {
      create: { id: string; lastPolledAt: Date | null };
      update: { lastPolledAt?: Date };
    }) => {
      this.cursor = this.cursor ? { ...this.cursor, ...update } : { ...create };
      return this.cursor;
    },
  };
}

describe('DeceasedEventPollerService', () => {
  let prisma: FakeCursorPrisma;
  let consentSecurity: jest.Mocked<Pick<ConsentSecurityClient, 'listDeceasedFrozenEventsSince'>>;
  let suppression: jest.Mocked<Pick<DeceasedSuppressionService, 'suppressAllForPatient'>>;
  let poller: DeceasedEventPollerService;

  beforeEach(() => {
    prisma = new FakeCursorPrisma();
    consentSecurity = { listDeceasedFrozenEventsSince: jest.fn().mockResolvedValue([]) };
    suppression = { suppressAllForPatient: jest.fn().mockResolvedValue({ plansSuppressed: 0, remindersSuppressed: 0 }) };
    poller = new DeceasedEventPollerService(prisma as any, consentSecurity as any, suppression as any);
  });

  it('creates a cursor on first run and polls with no `since` (fetch everything available)', async () => {
    await poller.poll();
    expect(consentSecurity.listDeceasedFrozenEventsSince).toHaveBeenCalledWith(undefined);
    expect(prisma.cursor?.lastPolledAt).toBeInstanceOf(Date);
  });

  it('immediately suppresses every patient found in a batch of freeze events', async () => {
    const events: PublishedDeceasedEvent[] = [
      {
        id: 'evt-1',
        type: 'patient.deceased.frozen',
        patientId: 'patient-1',
        payload: { flagId: 'flag-1', suppress: ['followup_reminders'] },
        occurredAt: new Date().toISOString(),
      },
      {
        id: 'evt-2',
        type: 'patient.deceased.frozen',
        patientId: 'patient-2',
        payload: { flagId: 'flag-2' },
        occurredAt: new Date().toISOString(),
      },
    ];
    consentSecurity.listDeceasedFrozenEventsSince.mockResolvedValueOnce(events);

    await poller.poll();

    expect(suppression.suppressAllForPatient).toHaveBeenCalledTimes(2);
    expect(suppression.suppressAllForPatient).toHaveBeenCalledWith('patient-1', 'flag-1', expect.anything());
    expect(suppression.suppressAllForPatient).toHaveBeenCalledWith('patient-2', 'flag-2', expect.anything());
  });

  it('advances the cursor on every poll, including when there are no new events', async () => {
    await poller.poll();
    const firstCursor = prisma.cursor?.lastPolledAt;
    expect(firstCursor).toBeInstanceOf(Date);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await poller.poll();
    expect(prisma.cursor?.lastPolledAt!.getTime()).toBeGreaterThanOrEqual(firstCursor!.getTime());
  });

  it('does not throw if the Consent & Security Service is unreachable — logs and lets the next tick retry', async () => {
    consentSecurity.listDeceasedFrozenEventsSince.mockRejectedValueOnce(new Error('network down'));
    await expect(poller.poll()).resolves.toBeUndefined();
    // suppression must not have been called with garbage data
    expect(suppression.suppressAllForPatient).not.toHaveBeenCalled();
  });
});
