import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterProfileDto } from './dto/register-profile.dto';
import { SearchDirectoryQueryDto } from './dto/search-directory.query.dto';
import {
  HEALTHPATHWAYS_CLIENT,
  type HealthPathwaysClient,
  type PathwaySuggestion,
} from './healthpathways/healthpathways-client.interface';
import { matchPathwayCategory } from './healthpathways/static-pathway-links';

export interface DirectoryEntryRecord {
  id: string;
  specialistId: string | null;
  hpiI: string | null;
  source: string;
  selfRegisteredOverride: boolean;
  displayName: string;
  subspecialty: string;
  practiceLocations: unknown;
  consultingDays: string[];
  econsultOptIn: boolean;
  acceptsBookingsViaPlatform: boolean;
  onboardedForDirectDelivery: boolean;
  secureMessagingVendor: string | null;
  secureMessagingEndpointId: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The minimal Prisma surface this service needs — kept narrow so unit tests can fake it easily. */
export interface DirectoryPrisma {
  directoryEntry: {
    findMany: (args: any) => Promise<DirectoryEntryRecord[]>;
    findUnique: (args: any) => Promise<DirectoryEntryRecord | null>;
    upsert: (args: any) => Promise<DirectoryEntryRecord>;
  };
}

export interface PathwaySuggestionResult extends PathwaySuggestion {
  /** Directory entries matching the suggested subspecialty, so the GP portal can go straight from suggestion to specialist pick. */
  matchingDirectoryEntries: DirectoryEntryRecord[];
}

/**
 * Directory Service's core business logic — module 7 of
 * modules-and-requirements.md. Directory profile writes (self-registration,
 * NHSD sync — see nhsd-sync/) are deliberately NOT routed through the
 * AuditOutbox/audit-log pattern here: per root CONVENTIONS.md §7, that
 * pattern is required for "clinical or consent-relevant" records, and a
 * specialist's own public practice-directory listing (name, subspecialty,
 * practice locations, consulting days) is provider reference data, not a
 * patient clinical or consent record — the same category as, say, a phone
 * book entry. See BUILD_LOG/directory.md for this judgment call and how to
 * revisit it if reviewers disagree (it only takes adding a
 * 'directory.entry.updated' AuditEventType to packages/shared-types, which
 * is out of this build's scope). Structured Logger calls stand in for
 * traceability instead. Contrast with secure-messaging/, where routing a
 * referral IS a referral-lifecycle event and does use the outbox pattern.
 */
@Injectable()
export class DirectoryService {
  private readonly logger = new Logger(DirectoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(HEALTHPATHWAYS_CLIENT) private readonly healthPathways: HealthPathwaysClient,
  ) {}

  async search(query: SearchDirectoryQueryDto): Promise<DirectoryEntryRecord[]> {
    const prisma = this.prisma as unknown as DirectoryPrisma;
    const where: Record<string, unknown> = {};
    if (query.q) {
      where.OR = [
        { displayName: { contains: query.q, mode: 'insensitive' } },
        { subspecialty: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.subspecialty) {
      where.subspecialty = { equals: query.subspecialty, mode: 'insensitive' };
    }
    if (query.acceptsBookingsViaPlatform !== undefined) {
      where.acceptsBookingsViaPlatform = query.acceptsBookingsViaPlatform === 'true';
    }
    if (query.econsultOptIn !== undefined) {
      where.econsultOptIn = query.econsultOptIn === 'true';
    }
    // `state` filters within the JSON practiceLocations array — Prisma's `path`/`array_contains`
    // JSON filtering is provider-dependent and not reliably testable against the hand-rolled
    // fake Prisma this build's unit tests use (see BUILD_LOG/directory.md), so state filtering
    // is applied in-process after the DB query rather than pushed into `where`. Fine at this
    // build's directory scale (per solution-architecture-tech-stack.md's Postgres-full-text-search
    // note); revisit if the directory grows large enough that this becomes a real cost.
    const results = await prisma.directoryEntry.findMany({
      where,
      take: query.limit && query.limit > 0 ? Math.min(query.limit, 200) : 50,
      skip: query.offset && query.offset > 0 ? query.offset : 0,
      orderBy: { displayName: 'asc' },
    });

    if (!query.state) {
      return results;
    }
    return results.filter((entry) =>
      Array.isArray(entry.practiceLocations)
        ? (entry.practiceLocations as Array<{ state?: string }>).some((loc) => loc.state === query.state)
        : false,
    );
  }

  async getById(id: string): Promise<DirectoryEntryRecord> {
    const prisma = this.prisma as unknown as DirectoryPrisma;
    const entry = await prisma.directoryEntry.findUnique({ where: { id } });
    if (!entry) {
      throw new NotFoundException(`DirectoryEntry ${id} not found`);
    }
    return entry;
  }

  /**
   * Self-registered profile create/update — always wins over synced NHSD
   * data for the same `hpiI` (modules-and-requirements.md). Upserted by
   * `hpiI` (the schema's unique key), so calling this twice for the same
   * specialist is safely idempotent.
   */
  async registerSelfProfile(dto: RegisterProfileDto): Promise<DirectoryEntryRecord> {
    const prisma = this.prisma as unknown as DirectoryPrisma;
    const shared = {
      source: 'self_registered',
      selfRegisteredOverride: true,
      displayName: dto.displayName,
      subspecialty: dto.subspecialty,
      practiceLocations: dto.practiceLocations,
      consultingDays: dto.consultingDays,
      econsultOptIn: dto.econsultOptIn ?? false,
      acceptsBookingsViaPlatform: dto.acceptsBookingsViaPlatform ?? false,
      onboardedForDirectDelivery: dto.onboardedForDirectDelivery ?? false,
      secureMessagingVendor: dto.secureMessagingVendor ?? null,
      secureMessagingEndpointId: dto.secureMessagingEndpointId ?? null,
    };

    const entry = await prisma.directoryEntry.upsert({
      where: { hpiI: dto.hpiI },
      create: { hpiI: dto.hpiI, ...shared },
      update: shared,
    });

    this.logger.log(`Self-registered profile upserted for hpiI=${dto.hpiI} (id=${entry.id})`);
    return entry;
  }

  /**
   * HealthPathways Pathway Link API integration — suggests a specialist
   * type/pathway for a free-text referral reason, with graceful degradation
   * to a static link when the (mocked) inline-guidance integration is
   * unavailable for the given PHN region. Always also resolves matching
   * directory entries for the suggested subspecialty so a caller can go
   * straight from "suggested pathway" to "pick a specialist."
   */
  async suggestPathway(referralReason: string, phnRegion?: string): Promise<PathwaySuggestionResult> {
    let suggestion: PathwaySuggestion;
    try {
      suggestion = await this.healthPathways.suggestPathway({ referralReason, phnRegion });
    } catch (err) {
      this.logger.warn(
        `HealthPathways suggestion failed (${err instanceof Error ? err.message : String(err)}) — falling back to static link`,
      );
      const match = matchPathwayCategory(referralReason);
      suggestion = {
        specialistType: match.specialistType,
        subspecialty: match.subspecialty,
        pathwayUrl: match.pathwayUrl,
        confidence: 0.4,
        source: 'static_fallback',
      };
    }

    const matchingDirectoryEntries = await this.search({
      subspecialty: suggestion.subspecialty,
    } as SearchDirectoryQueryDto);

    return { ...suggestion, matchingDirectoryEntries };
  }
}
