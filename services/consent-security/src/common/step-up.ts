import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@referralplatform/auth-client';

/**
 * Step-up / assurance-level enforcement — a deliberate, documented duplicate
 * of services/identity-access/src/common/step-up/step-up.ts and
 * services/gp-authorisation/src/common/step-up.ts (see that file's doc
 * comment for why it isn't shared yet). Used here to gate
 * `POST /deceased-flags/:patientId/access-requests/:id/approve` — root
 * CONVENTIONS.md §8 names "granting deceased-patient access" as the other
 * worked example of a step-up-gated action (alongside "approving a new GP
 * link", which services/gp-authorisation gates).
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
