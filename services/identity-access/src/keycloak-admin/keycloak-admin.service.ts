import { Injectable, InternalServerErrorException, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenProvider } from '@referralplatform/auth-client';

/** Shape of Keycloak's `CredentialRepresentation` (Admin REST API), trimmed to what this service uses. */
/** Minimal shape of Keycloak's `UserRepresentation` — only what callers here need. */
export interface KeycloakUser {
  id: string;
  username?: string;
  enabled?: boolean;
}

export interface KeycloakCredential {
  id: string;
  type: string; // 'webauthn' | 'webauthn-passwordless' | 'password' | 'otp' | ...
  userLabel?: string;
  createdDate?: number; // epoch millis
  credentialData?: string; // JSON-encoded string — AAGUID, transports, etc. for webauthn types
}

/** Shape of Keycloak's `FederatedIdentityRepresentation`. */
export interface KeycloakFederatedIdentity {
  identityProvider: string; // 'google' | 'microsoft' | 'myid'
  userId: string;
  userName: string;
}

/**
 * Thin wrapper around the subset of Keycloak's Admin REST API this service
 * needs: listing/revoking a user's own WebAuthn credentials, requesting
 * re-enrolment, and listing/removing brokered social-identity links.
 *
 * Every call authenticates as this service's own confidential Keycloak
 * client (`identity-access-service`) via `packages/auth-client`'s
 * `ServiceTokenProvider` (client-credentials grant) — never as the end user.
 * The service account needs the `realm-management` client roles
 * `manage-users` and `view-users` — granted in
 * `infra/keycloak/realm-export.json`.
 *
 * Every method call in this class is scoped to `userId`, which callers must
 * always populate from `AuthenticatedPrincipal.sub` (the verified caller's
 * own Keycloak subject id) — never from client-supplied input — so a
 * confidential-client-level Admin API credential can't be used to reach
 * outside the caller's own account. See src/passkeys and src/account-links.
 */
@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private readonly tokens: ServiceTokenProvider;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: ConfigService,
    // @Optional() tells Nest's DI container not to try to resolve a provider
    // for this parameter (it has no injection token of its own) — without it,
    // Nest throws "can't resolve dependencies" at app boot. Only ever passed
    // explicitly in tests (see keycloak-admin.service.spec.ts); real app code
    // always gets the global `fetch`.
    @Optional() fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
    // Built directly (rather than via common/clients.ts' createServiceTokenProvider
    // helper) so the same fetchImpl override used for Admin API calls is also used
    // for the client-credentials token request itself — this is what makes this
    // service unit-testable without a live Keycloak (see keycloak-admin.service.spec.ts).
    this.tokens = new ServiceTokenProvider({
      issuer: config.getOrThrow<string>('KEYCLOAK_ISSUER'),
      clientId: config.getOrThrow<string>('KEYCLOAK_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('KEYCLOAK_CLIENT_SECRET'),
      fetchImpl: this.fetchImpl,
    });
  }

  /**
   * Keycloak's issuer URL (`{server}/realms/{realm}`) and its Admin REST API
   * base (`{server}/admin/realms/{realm}`) share everything but the
   * `/admin` segment — derive the latter from `KEYCLOAK_ISSUER` rather than
   * requiring a second env var that could drift out of sync with it.
   */
  private adminBaseUrl(): string {
    const issuer = this.config.getOrThrow<string>('KEYCLOAK_ISSUER');
    const url = new URL(issuer);
    const realm = url.pathname.split('/').filter(Boolean).pop();
    return `${url.origin}/admin/realms/${realm}`;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.tokens.getToken();
    const res = await this.fetchImpl(`${this.adminBaseUrl()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new InternalServerErrorException(`Keycloak Admin API ${method} ${path} failed: ${res.status} ${text}`);
    }
    if (res.status === 204) {
      return undefined as T;
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async listCredentials(userId: string): Promise<KeycloakCredential[]> {
    return this.request<KeycloakCredential[]>('GET', `/users/${encodeURIComponent(userId)}/credentials`);
  }

  /**
   * Every user in the realm, paged (Keycloak returns no total count — keep
   * requesting until a short page comes back).
   *
   * NOTE ON THE OBVIOUS ALTERNATIVE: `GET /roles/{role}/users` would return just
   * the clinicians directly and avoid walking every patient account. It requires
   * the `view-realm` client role, which this service account deliberately does not
   * hold — `view-realm` grants read access to the whole realm configuration
   * (clients, identity providers, authentication flows), which is far more than a
   * credential reconciler needs. Enumerating users and reading each one's role
   * mappings stays within the `view-users` this service already documents needing.
   * If the realm ever grows large enough for that to hurt, prefer paging in the
   * background over widening this service account's privileges.
   */
  async listUsers(pageSize = 100): Promise<KeycloakUser[]> {
    const all: KeycloakUser[] = [];
    for (let first = 0; ; first += pageSize) {
      const page = await this.request<KeycloakUser[]>('GET', `/users?first=${first}&max=${pageSize}`);
      all.push(...page);
      if (page.length < pageSize) {
        return all;
      }
    }
  }

  /** The realm-role names assigned to a user (readable with `view-users`). */
  async listRealmRoleNames(userId: string): Promise<string[]> {
    const roles = await this.request<{ name: string }[]>(
      'GET',
      `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
    );
    return roles.map((r) => r.name);
  }

  async deleteCredential(userId: string, credentialId: string): Promise<void> {
    await this.request<void>(
      'DELETE',
      `/users/${encodeURIComponent(userId)}/credentials/${encodeURIComponent(credentialId)}`,
    );
  }

  /**
   * Adds a Keycloak "required action" (e.g. `webauthn-register-passwordless`)
   * to a user, forcing enrolment on their next login — merges with whatever
   * required actions are already set rather than overwriting them.
   */
  async addRequiredAction(userId: string, action: string): Promise<void> {
    const user = await this.request<{ requiredActions?: string[] }>('GET', `/users/${encodeURIComponent(userId)}`);
    const requiredActions = Array.from(new Set([...(user.requiredActions ?? []), action]));
    await this.request<void>('PUT', `/users/${encodeURIComponent(userId)}`, { requiredActions });
  }

  async listFederatedIdentities(userId: string): Promise<KeycloakFederatedIdentity[]> {
    return this.request<KeycloakFederatedIdentity[]>('GET', `/users/${encodeURIComponent(userId)}/federated-identity`);
  }

  async removeFederatedIdentity(userId: string, provider: string): Promise<void> {
    await this.request<void>(
      'DELETE',
      `/users/${encodeURIComponent(userId)}/federated-identity/${encodeURIComponent(provider)}`,
    );
  }
}
