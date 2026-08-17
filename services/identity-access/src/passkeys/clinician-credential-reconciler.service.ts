import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { AuditClient } from '@referralplatform/audit-client';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import { createAuditClient } from '../common/clients';
import { asAuditEventType } from '../common/audit/identity-audit-events';

/** Realm roles whose holders must authenticate with a passkey only (AAL2/AAL3). */
const CLINICIAN_ROLES = ['gp', 'specialist'] as const;

/** A passkey usable as a full sign-in credential. `webauthn` (2FA-only) does not count. */
const PASSWORDLESS_TYPE = 'webauthn-passwordless';

const RECONCILE_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Removes a clinician's bootstrap password once they hold a real passkey.
 *
 * WHY THIS EXISTS — `identity-security-recommendations.md` §6 requires passkey or
 * hardware key to be *mandatory* for GPs and specialists (AAL2/AAL3), because the
 * blast radius of a compromised clinician account spans many patients' PHI rather
 * than one person's own record. `clinician-browser`'s credential sub-flow offers
 * WebAuthn and password as ALTERNATIVEs, and Keycloak offers a user whichever
 * branches they actually hold a credential for. A clinician therefore needs a
 * password exactly once — to bootstrap their first login, at which point the
 * `webauthn-register-passwordless` required action forces enrolment — and must not
 * keep it afterwards, because Keycloak would go on offering the password branch and
 * the account would silently sit at AAL1 while appearing to be passkey-protected.
 * That was observed for real on 2026-08-17: a clinician holding both credentials was
 * offered the password form *instead of* the passkey prompt.
 *
 * WHY A RECONCILER, NOT A HOOK — enrolment completes inside Keycloak's own
 * required-action UI, which this service never sees. Observing it directly would
 * mean shipping a Keycloak event-listener SPI extension (a Java provider JAR baked
 * into the image). A periodic sweep needs no Keycloak extension, and is
 * self-healing: it also catches accounts that drift for reasons no hook would see —
 * an admin re-adding a password, a realm re-import, a restored backup.
 *
 * SAFETY — a clinician with a password but NO passkey is left completely alone.
 * They are mid-onboarding and that password is the only way in; deleting it would
 * lock them out permanently. Only the both-credentials case is acted on.
 */
@Injectable()
export class ClinicianCredentialReconciler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ClinicianCredentialReconciler.name);
  private readonly auditClient: AuditClient;
  private running = false;

  constructor(
    private readonly keycloakAdmin: KeycloakAdminService,
    config: ConfigService,
  ) {
    this.auditClient = createAuditClient(config);
  }

  /**
   * Converge once at startup rather than waiting a full interval. Without this, a
   * deploy that follows a batch of enrolments leaves those accounts sitting at AAL1
   * for up to RECONCILE_INTERVAL_MS. Deliberately not awaited into boot: Keycloak
   * may not be reachable yet, and this must never stop the service from starting —
   * a failure here is logged and the interval retries.
   */
  onApplicationBootstrap(): void {
    void this.scheduledReconcile();
  }

  @Interval(RECONCILE_INTERVAL_MS)
  async scheduledReconcile(): Promise<void> {
    // A slow sweep (many clinicians, slow Keycloak) must not overlap itself and
    // attempt the same deletions twice.
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.reconcile();
    } catch (err) {
      this.logger.error(`Clinician credential reconcile failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Returns how many bootstrap passwords were removed. Exposed for tests and manual runs. */
  async reconcile(): Promise<number> {
    let removed = 0;
    let clinicians = 0;

    for (const user of await this.keycloakAdmin.listUsers()) {
      const roles = await this.keycloakAdmin.listRealmRoleNames(user.id);
      const role = CLINICIAN_ROLES.find((r) => roles.includes(r));
      if (!role) {
        continue;
      }
      clinicians += 1;
      if (await this.reconcileUser(user.id, user.username, role)) {
        removed += 1;
      }
    }

    this.logger.log(
      `Clinician credential sweep: ${clinicians} clinician account(s) checked, ${removed} bootstrap password(s) removed`,
    );
    return removed;
  }

  private async reconcileUser(userId: string, username: string | undefined, role: string): Promise<boolean> {
    const credentials = await this.keycloakAdmin.listCredentials(userId);
    const passkey = credentials.find((c) => c.type === PASSWORDLESS_TYPE);
    const password = credentials.find((c) => c.type === 'password');

    // No passkey yet: this clinician is still onboarding and the password is their
    // only way in. Removing it here would lock them out with no recovery path.
    if (!passkey || !password) {
      return false;
    }

    await this.keycloakAdmin.deleteCredential(userId, password.id);
    this.logger.log(
      `Removed bootstrap password for clinician ${username ?? userId} (role=${role}) — passkey enrolled, account is now passkey-only`,
    );

    // Deleting a credential is a security-relevant change to how an account can
    // authenticate, so it belongs in the audit trail even though the platform, not
    // a human, initiated it.
    //
    // Deliberately non-fatal, for two reasons. First, the deletion has already
    // happened — throwing here cannot undo it, it would only abandon the rest of
    // the sweep and leave other clinicians sitting at AAL1. Second, this is a
    // direct (non-outbox) audit write, so a failure means the record is genuinely
    // lost rather than retried; that deserves a loud, specific error naming the
    // account, not a generic sweep failure. See TODO 2d — IAM events arguably
    // belong on the outbox for exactly this reason.
    try {
      await this.auditClient.record({
        type: asAuditEventType('identity.bootstrap_password.removed'),
        actor: { principalType: 'system', id: 'identity-access.clinician-credential-reconciler' },
        subject: { type: 'Principal', id: userId },
        payload: { role, reason: 'passkey_enrolled', removedCredentialId: password.id },
      });
    } catch (err) {
      this.logger.error(
        `Bootstrap password for ${username ?? userId} was removed, but the audit record FAILED and is lost: ${
          (err as Error).message
        }`,
      );
    }

    return true;
  }
}
