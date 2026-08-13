/** Matches shared-types' `AustralianState` union — kept local since this file is a DTO-validation constant, not a domain type re-export (see root CONVENTIONS.md §4 for when to import shared-types directly instead). */
export const AUSTRALIAN_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const;
