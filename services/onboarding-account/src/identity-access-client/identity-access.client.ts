import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenProvider } from '@referralplatform/auth-client';

export interface PromptPasskeyEnrolmentInput {
  /** The Keycloak subject id (user id) of the newly activated account. */
  keycloakUserId: string;
  principalType: 'patient' | 'carer';
}

export interface PromptPasskeyEnrolmentResult {
  prompted: boolean;
  reason?: string;
}

/**
 * Calls the Identity & Access Service to prompt passkey enrolment right
 * after account activation — see identity-security-recommendations.md §6
 * ("As soon as the account is activated, prompt enrolment in a stronger
 * credential") and modules-and-requirements.md's Onboarding & Account
 * functional requirements.
 *
 * KNOWN INTEGRATION GAP (see BUILD_LOG/onboarding-account.md): the real
 * endpoint this should call — `POST /passkeys/require-reenrolment` on
 * `services/identity-access` — is implemented (see
 * services/identity-access/src/passkeys/passkeys.controller.ts) but is
 * deliberately scoped to *the caller's own account*: it reads the target
 * user id from the verified bearer token's `sub` claim
 * (`AuthenticatedPrincipal.sub`), not from a request body, specifically so a
 * confidential service-to-service client credential can never be used to
 * force a re-enrolment requirement onto an arbitrary *other* account. That
 * is the right security posture for that endpoint, but it means this
 * service — which needs to act *on behalf of* a just-activated patient/carer
 * who doesn't have a browser session yet — cannot call it with a plain
 * client-credentials token.
 *
 * The two real fixes, either of which is a small, additive change to
 * `services/identity-access` (out of this agent's scope,
 * `services/onboarding-account` only):
 *   1. A dedicated internal endpoint (e.g. `POST /internal/passkey-enrolment-prompts`)
 *      that accepts a target Keycloak user id, gated to a narrow allow-list
 *      of trusted service callers (onboarding-account, gp-authorisation's
 *      recovery flow) rather than "any bearer token" — mirroring how
 *      KeycloakAdminService itself is scoped to `manage-users`/`view-users`
 *      realm-management roles, not a public surface.
 *   2. Set the `webauthn-register-passwordless` required action directly as
 *      part of Keycloak user *provisioning* (wherever the Keycloak user
 *      record for a newly activated patient/carer is actually created —
 *      also not yet built in this scaffold; see BUILD_LOG for the parallel
 *      "who creates the Keycloak user" gap), so there's no second
 *      cross-service call needed at all.
 *
 * Until one of those lands, this client makes a best-effort call against the
 * existing endpoint (useful once a compatible internal route exists — the
 * request shape below is what it would need), catches every failure, and
 * always returns rather than throwing — a failed passkey *prompt* must never
 * block account activation, which is the one outcome that actually matters
 * for this flow.
 */
@Injectable()
export class IdentityAccessClient {
  private readonly logger = new Logger(IdentityAccessClient.name);
  private readonly tokens: ServiceTokenProvider;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: ConfigService,
    @Optional() fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
    this.tokens = new ServiceTokenProvider({
      issuer: config.getOrThrow<string>('KEYCLOAK_ISSUER'),
      clientId: config.getOrThrow<string>('KEYCLOAK_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('KEYCLOAK_CLIENT_SECRET'),
      fetchImpl: this.fetchImpl,
    });
  }

  async promptPasskeyEnrolment(input: PromptPasskeyEnrolmentInput): Promise<PromptPasskeyEnrolmentResult> {
    const baseUrl = this.config.get<string>('IDENTITY_ACCESS_SERVICE_URL');
    if (!baseUrl) {
      return { prompted: false, reason: 'IDENTITY_ACCESS_SERVICE_URL is not configured' };
    }
    try {
      const token = await this.tokens.getToken();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      let res: Response;
      try {
        // See the class doc comment: this internal route does not exist on
        // identity-access yet. Calling it anyway (rather than a fully local
        // no-op) means this client starts working the moment that gap is
        // closed, with no change needed here.
        res = await this.fetchImpl(`${baseUrl}/internal/passkey-enrolment-prompts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ userId: input.keycloakUserId, principalType: input.principalType }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!res.ok) {
        return { prompted: false, reason: `Identity & Access Service returned ${res.status}` };
      }
      return { prompted: true };
    } catch (err) {
      this.logger.warn(`Passkey enrolment prompt failed for ${input.keycloakUserId}: ${(err as Error).message}`);
      return { prompted: false, reason: (err as Error).message };
    }
  }
}
