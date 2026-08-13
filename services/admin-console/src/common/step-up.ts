import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@referralplatform/auth-client';

/**
 * Step-up / assurance-level enforcement — a deliberate, documented duplicate
 * of services/identity-access/src/common/step-up/step-up.ts and the same
 * pattern in gp-authorisation/consent-security (see those files' doc
 * comments for why it isn't a shared package yet). Used here to gate the
 * decision actions this console exposes over already-sensitive workflows —
 * approving/rejecting an AHPRA/WWCC manual verification case, and advancing
 * a practice onboarding case to "live" — root CONVENTIONS.md §8 names
 * "granting deceased-patient access" (proxied unchanged to consent-security,
 * which enforces its own step-up) and "approving a new GP link" as the
 * worked examples this mirrors.
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
