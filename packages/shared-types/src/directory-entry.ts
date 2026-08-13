import { DirectoryEntryId, HPII, ISODateTimeString, SpecialistId } from './common';

export type DirectoryEntrySource = 'nhsd_sync' | 'self_registered' | 'healthpathways_suggested';

/**
 * A specialist/GP directory entry. Self-registered data always supersedes synced
 * NHSD data for the same entity — sync jobs are idempotent and safely re-runnable.
 * See modules-and-requirements.md, Directory Service functional requirements.
 */
export interface DirectoryEntry {
  id: DirectoryEntryId;
  specialistId?: SpecialistId;
  hpiI?: HPII;
  source: DirectoryEntrySource;
  /** True once a specialist has self-registered and their profile supersedes any synced copy. */
  selfRegisteredOverride: boolean;
  displayName: string;
  subspecialty: string;
  practiceLocations: DirectoryPracticeLocation[];
  consultingDays: string[];
  /** Whether this specialist has opted in to the eConsult/async-advice pathway — a separate decision from taking bookings. */
  econsultOptIn: boolean;
  acceptsBookingsViaPlatform: boolean;
  lastSyncedAt?: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface DirectoryPracticeLocation {
  name: string;
  suburb: string;
  state: string;
  postcode: string;
}
