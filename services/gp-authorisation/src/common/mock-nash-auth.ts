/**
 * MOCK — replace with real integration.
 *
 * Real HPI-O/NASH authentication verifies the *calling practice system's*
 * NASH-issued organisation certificate over mutual TLS — NASH (the National
 * Authentication Service for Health) issues PKI certificates tied to a
 * practice's HPI-O, and the Healthcare Identifiers Service is the
 * authoritative source for whether a given HPI-O is valid/active. Neither is
 * available to this build (no NASH PKI test certificates, no live HI
 * Service connection — see claude/solution-architecture-tech-stack.md and
 * the Integration & FHIR Gateway service, which is the intended real home
 * for a future HPI-O lookup call).
 *
 * This mock instead enforces two structurally-checkable things at the
 * application layer, standing in for "this request came from an
 * authenticated, HPI-O-bearing practice system":
 *   (a) the caller authenticated with a valid Keycloak bearer token whose
 *       `principal_type` claim is 'gp' or 'system' (a practice system
 *       calling on a GP's behalf, or an already-authenticated GP's own
 *       session) — enforced by HpioNashAuthGuard, not this file;
 *   (b) the HPI-O supplied for the link request matches the Healthcare
 *       Identifiers Service's published format (16 numeric digits,
 *       conventionally prefixed 800362 for organisation identifiers).
 *
 * Swap this for a real mTLS/NASH certificate check at the ingress/gateway
 * layer plus a live HPI-O status lookup via the Integration & FHIR Gateway
 * once that's available — HpioNashAuthGuard's call site doesn't need to
 * change shape, only this function's internals.
 */
const HPIO_FORMAT = /^\d{16}$/;

export function isValidHpioFormat(hpio: string): boolean {
  return HPIO_FORMAT.test(hpio);
}

/** MOCK: a format-valid HPI-O is treated as an "authorised practice system" for this build. */
export function mockVerifyPracticeSystemAuthorised(hpio: string): boolean {
  return isValidHpioFormat(hpio);
}
