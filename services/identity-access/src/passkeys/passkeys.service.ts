import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@referralplatform/auth-client';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import { AuditOutboxService } from '../audit-outbox/audit-outbox.service';

export interface PasskeySummary {
  id: string;
  label: string;
  registeredAt: string | null;
  /** True for `webauthn-passwordless` (usable as a full sign-in credential, i.e. a real passkey); false for `webauthn` (2FA-only). */
  isPasswordless: boolean;
}

const WEBAUTHN_CREDENTIAL_TYPES = new Set(['webauthn', 'webauthn-passwordless']);

/**
 * Passkey/WebAuthn credential management for the caller's own account.
 *
 * Registration and login themselves happen through Keycloak's native
 * WebAuthn support (the realm's `webAuthnPolicy*` / `webAuthnPolicyPasswordless*`
 * settings and the `clinician-browser` / `patient-carer-browser` custom
 * authentication flows — see infra/keycloak/realm-export.json) during the
 * OIDC browser redirect Keycloak already owns; this service does not
 * reimplement the WebAuthn attestation/assertion ceremony itself; it manages
 * the credentials Keycloak already holds via the Admin REST API, and can
 * force re-enrolment (used e.g. when the Onboarding & Account Service or a
 * GP-assisted recovery flow determines a patient/carer/GP/specialist needs to
 * register a new passkey).
 */
@Injectable()
export class PasskeysService {
  constructor(
    private readonly keycloakAdmin: KeycloakAdminService,
    private readonly auditOutbox: AuditOutboxService,
  ) {}

  async list(principal: AuthenticatedPrincipal): Promise<PasskeySummary[]> {
    const credentials = await this.keycloakAdmin.listCredentials(principal.sub);
    return credentials
      .filter((c) => WEBAUTHN_CREDENTIAL_TYPES.has(c.type))
      .map((c) => ({
        id: c.id,
        label: c.userLabel || 'Passkey',
        registeredAt: c.createdDate ? new Date(c.createdDate).toISOString() : null,
        isPasswordless: c.type === 'webauthn-passwordless',
      }));
  }

  async revoke(principal: AuthenticatedPrincipal, credentialId: string): Promise<void> {
    const owned = await this.list(principal);
    if (!owned.some((c) => c.id === credentialId)) {
      // Scoped strictly to the caller's own credential list — a credential id
      // that exists but belongs to someone else (or doesn't exist at all)
      // looks identical from the caller's perspective: 404, not 403, so this
      // endpoint never confirms/denies another account's credential ids.
      throw new NotFoundException('No such passkey on this account');
    }

    await this.keycloakAdmin.deleteCredential(principal.sub, credentialId);

    await this.auditOutbox.enqueueStandalone({
      type: 'identity.passkey.revoked',
      actor: { principalType: principal.principalType, id: principal.sub },
      subject: { type: 'WebAuthnCredential', id: credentialId },
      payload: { revokedBy: principal.sub },
    });
  }

  /** Forces re-enrolment (e.g. GP-assisted recovery after a lost device — see identity-security-recommendations.md §6). */
  async requireReenrolment(principal: AuthenticatedPrincipal): Promise<void> {
    const action =
      principal.principalType === 'gp' || principal.principalType === 'specialist'
        ? 'webauthn-register' // AAL2/AAL3 mandatory second factor for clinicians
        : 'webauthn-register-passwordless'; // encouraged full passkey for patients/carers

    await this.keycloakAdmin.addRequiredAction(principal.sub, action);

    await this.auditOutbox.enqueueStandalone({
      type: 'identity.passkey.reenrolment_required',
      actor: { principalType: principal.principalType, id: principal.sub },
      subject: { type: 'Principal', id: principal.sub },
      payload: { requiredAction: action },
    });
  }
}
