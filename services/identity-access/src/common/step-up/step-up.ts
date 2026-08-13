import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@referralplatform/auth-client';

/**
 * Step-up / assurance-level enforcement for sensitive identity-access actions
 * (revoking a passkey, unlinking a social sign-in method) — implements the
 * pattern root CONVENTIONS.md §8 documents but leaves to each service:
 * "packages/auth-client doesn't enforce assurance level itself ... checked in
 * application code via AuthenticatedPrincipal.raw's acr/amr claims for
 * step-up-gated actions."
 *
 * KNOWN GAP (see infra/keycloak/README.md, "Step-up authentication"): the
 * realm does not yet have a Conditional-OTP/ACR-to-LoA authentication flow
 * that actually issues a distinguishable `acr` value after a fresh
 * passkey/hardware-key re-auth, or a `sid`-scoped re-auth prompt endpoint for
 * the frontend to trigger before calling a step-up-gated route. This function
 * is written against the claim shape Keycloak *will* emit once that flow
 * exists (a realm-configured `acr` value, defaulting to `STEP_UP_ACR` env var,
 * standing in for "gold"/AAL2+" per the NIST 800-63B tiers already researched
 * — see identity-security-recommendations.md §6) so callers don't need to
 * change when that flow lands — only this function's internals will.
 * Until then, this check is enforced but will reject any token that hasn't
 * been asked to carry an elevated `acr`/`amr`, which in local dev means every
 * caller unless the test/dev token is crafted to include it.
 */
export function assertStepUp(principal: AuthenticatedPrincipal, requiredAcr: string): void {
  const raw = principal.raw as Record<string, unknown>;
  const acr = typeof raw.acr === 'string' ? raw.acr : undefined;
  const amr = Array.isArray(raw.amr) ? (raw.amr as unknown[]).filter((v) => typeof v === 'string') : [];

  const satisfiesAcr = acr === requiredAcr;
  const satisfiesAmr = amr.includes('webauthn') || amr.includes('hwk') || amr.includes('swk');

  if (!satisfiesAcr && !satisfiesAmr) {
    throw new ForbiddenException(
      'This action requires a recent passkey or hardware-key re-authentication (step-up). ' +
        'Re-authenticate with a phishing-resistant credential and try again.',
    );
  }
}
