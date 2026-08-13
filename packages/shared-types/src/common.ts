/**
 * Common branded ID types and shared enums used across every domain object.
 *
 * IDs are branded strings (not raw `string`) so that, for example, a `PatientId`
 * can't accidentally be passed where a `ReferralId` is expected — TypeScript will
 * reject it even though both are strings at runtime. Every service should generate
 * these as UUIDv7 (time-ordered, good for Postgres primary key locality) unless a
 * domain identifier (IHI, HPI-O, HPI-I) is the natural key.
 */

declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type PatientId = Brand<string, 'PatientId'>;
export type CarerId = Brand<string, 'CarerId'>;
export type GPId = Brand<string, 'GPId'>;
export type GPLinkId = Brand<string, 'GPLinkId'>;
export type SpecialistId = Brand<string, 'SpecialistId'>;
export type ReferralId = Brand<string, 'ReferralId'>;
export type ComplianceFlagId = Brand<string, 'ComplianceFlagId'>;
export type DirectoryEntryId = Brand<string, 'DirectoryEntryId'>;
export type BookingId = Brand<string, 'BookingId'>;
export type FollowUpPlanId = Brand<string, 'FollowUpPlanId'>;
export type AuditEventId = Brand<string, 'AuditEventId'>;
export type ConsentRecordId = Brand<string, 'ConsentRecordId'>;
export type ConcernId = Brand<string, 'ConcernId'>;

/** Individual Healthcare Identifier — issued by the Healthcare Identifiers Service. */
export type IHI = Brand<string, 'IHI'>;
/** Healthcare Provider Identifier — Organisation (a practice/hospital/PHN entity). */
export type HPIO = Brand<string, 'HPIO'>;
/** Healthcare Provider Identifier — Individual (a registered practitioner). */
export type HPII = Brand<string, 'HPII'>;

/** ISO 8601 timestamp string, always UTC (`...Z`). Never a bare `Date` on the wire. */
export type ISODateTimeString = Brand<string, 'ISODateTimeString'>;
/** ISO 8601 calendar date, no time component, e.g. `2026-08-13`. */
export type ISODateString = Brand<string, 'ISODateString'>;

/**
 * Australian state/territory — used to key jurisdiction-specific rules (WWCC,
 * compliance checklist content, information-sharing scheme rules). Keyed to the
 * *treating GP's* state by default, per identity-security-recommendations.md /
 * minors-multigp-exception-paths.md — not the patient's home address.
 */
export type AustralianState = 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'TAS' | 'ACT' | 'NT';

/**
 * Every principal type the platform authenticates, per modules-and-requirements.md
 * (Identity & Access Service). Kept here because many domain objects reference
 * "who did this" using this union.
 */
export type PrincipalType = 'patient' | 'carer' | 'gp' | 'specialist' | 'internal_staff' | 'system';

export interface ActorRef {
  principalType: PrincipalType;
  /** The actor's own id (PatientId, CarerId, GPId, SpecialistId, or a staff user id). */
  id: string;
  /** IHI/HPI-O/HPI-I as appropriate for the actor type — required for audit non-repudiation. */
  healthcareIdentifier?: IHI | HPIO | HPII;
  displayName?: string;
}
