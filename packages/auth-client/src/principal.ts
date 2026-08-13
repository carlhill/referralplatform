/**
 * Kept as a local, deliberately loose copy of shared-types' PrincipalType rather
 * than a hard dependency on @referralplatform/shared-types — auth-client is meant
 * to be usable from the FHIR gateway's Node-side tooling and other non-Nest
 * contexts without pulling in the full domain-types package. If the two drift,
 * shared-types is the source of truth; update this to match.
 */
export type PrincipalType = 'patient' | 'carer' | 'gp' | 'specialist' | 'internal_staff' | 'system';
