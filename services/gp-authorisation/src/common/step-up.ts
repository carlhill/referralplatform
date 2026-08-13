import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@referralplatform/auth-client';

/**
 * Step-up / assurance-level enforcement for sensitive GP-authorisation
 * actions — root CONVENTIONS.md §8 names "approving a new GP link" as one of
 * the two worked examples of a step-up-gated action, so `POST
 * /gp-links/:id/approve` uses this.
 *
 * This is a deliberate, documented duplicate of
 * services/identity-access/src/common/step-up/step-up.ts — that file isn't
 * exported from a shared package yet (see that service's BUILD_LOG
 * "Suggested follow-up"), and this build's scope doesn't include editing
 * packages/auth-client. Promote both copies into
 * packages/auth-client/src/step-up.ts next time either service is touched,
 * rather than letting a third copy appear elsewhere.
 *
 * KNOWN GAP (see services/identity-access/BUILD_LOG.md and
 * infra/keycloak/README.md): the realm doesn't yet emit a distinguishable
 * elevated `acr` after a fresh passkey re-auth, so in local dev this will
 * reject any token that hasn't been deliberately crafted to carry it.
 */
export function assertStepUp(principal: AuthenticatedPrincipal, requiredAcr: string): void {
  const raw = principal.raw as Record<string, unknown>;
  const acr = typeof raw.acr === 'string' ? raw.acr : undefined;
  const amr = Array.isArray(raw.amr) ? (raw.amr as unknown[]).filter((v) => typeof v === 'string') : [];

  const satisfiesAcr = acr === requiredAcr;
  const satisfiesAmr = amr.includes('webauthn') || amr.includes('hwk') || amr.includes('swk');

  if (!satisfiesAcr && !satisfiesAmr) {
    throw new ForbiddenException(
      'Approving a new GP link requires a recent passkey or hardware-key re-authentication (step-up). ' +
        'Re-authenticate with a phishing-resistant credential and try again.',
    );
  }
}
