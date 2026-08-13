import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NHSD_DIRECTORY_CLIENT, type NhsdDirectoryClient, type NhsdProviderRecord } from './nhsd-client.interface';

export interface NhsdSyncResult {
  runId: string;
  fetched: number;
  upserted: number;
  skippedSelfRegistered: number;
}

/** The minimal Prisma surface this service needs — kept narrow so unit tests can fake it easily. */
export interface NhsdSyncPrisma {
  directorySyncRun: {
    create: (args: unknown) => Promise<{ id: string }>;
    update: (args: unknown) => Promise<unknown>;
  };
  directoryEntry: {
    findUnique: (args: unknown) => Promise<{ id: string; selfRegisteredOverride: boolean } | null>;
    create: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
  };
}

/**
 * Scheduled NHSD sync job — module 7 (Directory Service) of
 * modules-and-requirements.md: "sync jobs must be idempotent and safely
 * re-runnable" and "self-registered specialist data must always win over
 * synced NHSD data for the same entity."
 *
 * Idempotency: upsert is keyed on `hpiI` (unique in the schema) — re-running
 * against the same NHSD dataset always converges to the same rows rather
 * than creating duplicates.
 *
 * Self-registration supersedes sync: an entry with `selfRegisteredOverride
 * = true` is left completely untouched by sync (not even `lastSyncedAt` is
 * bumped) — see BUILD_LOG/directory.md for why "untouched" rather than
 * "merge NHSD's copy into unedited fields" was chosen: without a
 * field-level provenance model (out of scope for this build), a partial
 * merge risks silently overwriting a specialist's deliberate edit with
 * stale synced data, which is a worse failure mode than a sync simply
 * skipping the record.
 */
@Injectable()
export class NhsdSyncService {
  private readonly logger = new Logger(NhsdSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NHSD_DIRECTORY_CLIENT) private readonly nhsdClient: NhsdDirectoryClient,
  ) {}

  /** Daily at 02:00 — low-traffic window; directory data doesn't need faster propagation than that. */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async scheduledSync(): Promise<void> {
    try {
      const result = await this.runSync();
      this.logger.log(
        `NHSD sync run ${result.runId} complete: fetched=${result.fetched} upserted=${result.upserted} skippedSelfRegistered=${result.skippedSelfRegistered}`,
      );
    } catch (err) {
      this.logger.error('Scheduled NHSD sync failed', err instanceof Error ? err.stack : String(err));
    }
  }

  /** Also callable directly — the manual `POST /directory/sync/trigger` admin endpoint and unit tests use this. */
  async runSync(): Promise<NhsdSyncResult> {
    const prisma = this.prisma as unknown as NhsdSyncPrisma;
    const run = await prisma.directorySyncRun.create({ data: { source: 'nhsd_mock', status: 'running' } });

    let fetched: NhsdProviderRecord[];
    try {
      fetched = await this.nhsdClient.fetchProviders();
    } catch (err) {
      await prisma.directorySyncRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }

    let upserted = 0;
    let skipped = 0;

    for (const record of fetched) {
      const existing = await prisma.directoryEntry.findUnique({ where: { hpiI: record.hpiI } });
      if (existing?.selfRegisteredOverride) {
        skipped += 1;
        continue;
      }

      const data = {
        hpiI: record.hpiI,
        source: 'nhsd_sync',
        selfRegisteredOverride: false,
        displayName: record.displayName,
        subspecialty: record.subspecialty,
        practiceLocations: record.practiceLocations,
        consultingDays: record.consultingDays,
        econsultOptIn: record.econsultOptIn,
        acceptsBookingsViaPlatform: record.acceptsBookingsViaPlatform,
        lastSyncedAt: new Date(),
      };

      if (existing) {
        await prisma.directoryEntry.update({ where: { hpiI: record.hpiI }, data });
      } else {
        await prisma.directoryEntry.create({ data });
      }
      upserted += 1;
    }

    await prisma.directorySyncRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        recordsFetched: fetched.length,
        recordsUpserted: upserted,
        recordsSkippedSelfRegistered: skipped,
      },
    });

    return { runId: run.id, fetched: fetched.length, upserted, skippedSelfRegistered: skipped };
  }
}
