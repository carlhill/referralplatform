import { randomBytes, createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedPrincipal } from '@referralplatform/auth-client';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditOutboxService } from '../audit-outbox/audit-outbox.service';
import type { KnownClientId } from './dto/create-link-url.dto';

/**
 * The ONLY identity providers a caller may request a secondary-sign-in link
 * for. Deliberately excludes:
 *  - 'myid' — myID is a stub for higher-assurance elevation/proofing (see
 *    src/mock-myid), never a convenience-linking target.
 *  - any internal service Keycloak client — those aren't identity providers
 *    at all, but rejecting them explicitly here (rather than only trusting
 *    the realm's identityProviders list) means this allow-list is the single
 *    source of truth an auditor can read without cross-referencing the
 *    realm export.
 * See claude/solution-architecture-tech-stack.md ("Identity and access") and
 * claude/modules-and-requirements.md — social login is "strictly as a
 * secondary sign-in method ... never as a path to create or activate an
 * account, and never able to skip the OTP/DOB/Medicare verification."
 */
export const LINKABLE_PROVIDERS = ['google', 'microsoft'] as const;
export type LinkableProvider = (typeof LINKABLE_PROVIDERS)[number];

const LINK_REQUEST_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class AccountLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keycloakAdmin: KeycloakAdminService,
    private readonly config: ConfigService,
    private readonly auditOutbox: AuditOutboxService,
  ) {}

  private assertLinkable(provider: string): asserts provider is LinkableProvider {
    if (!(LINKABLE_PROVIDERS as readonly string[]).includes(provider)) {
      throw new BadRequestException(
        `'${provider}' cannot be used for secondary sign-in linking. Only ${LINKABLE_PROVIDERS.join(
          ', ',
        )} are supported — social login is never a path to create or activate an account.`,
      );
    }
  }

  private assertAllowedRedirect(redirectUri: string): void {
    const allowedOrigins = this.config
      .get<string>('ACCOUNT_LINK_ALLOWED_ORIGINS', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const matches = allowedOrigins.some((origin) => redirectUri === origin || redirectUri.startsWith(`${origin}/`));
    if (!matches) {
      throw new ForbiddenException("redirectUri is not one of this platform's known frontend origins");
    }
  }

  /**
   * Builds a Keycloak "Client Initiated Account Linking" URL — the caller's
   * browser is redirected here to complete the Google/Microsoft OAuth dance
   * and, on success, Keycloak attaches that brokered identity to *this
   * already-authenticated* account. This is the concrete mechanism that
   * makes "social login never creates or activates an account" true rather
   * than just documented: Keycloak's `/broker/{provider}/link` endpoint only
   * honours this flow for an identity provider configured with
   * `linkOnly: true` (see infra/keycloak/realm-export.json) — for a
   * `linkOnly` provider, Keycloak refuses to use it as a fresh login/
   * registration method at all, so there is no code path, correct or buggy,
   * by which this mechanism could create a new account.
   *
   * Requires the caller to already be authenticated — enforced twice: (1)
   * this method is only reachable via AccountLinksController, which the
   * requireAuth middleware guards (see app.module.ts); (2) the returned URL
   * itself is only valid against Keycloak because `hash` is derived from a
   * `sessionId` that can only be known by someone who already holds a valid
   * Keycloak SSO session for this account.
   *
   * hash = base64url(sha256(nonce + sessionId + clientId + providerAlias))
   * — Keycloak's documented Client Initiated Account Linking algorithm.
   */
  async createLinkUrl(
    principal: AuthenticatedPrincipal,
    provider: string,
    clientId: KnownClientId,
    redirectUri: string,
    sessionId: string,
  ): Promise<{ linkUrl: string; expiresAt: string }> {
    this.assertLinkable(provider);
    this.assertAllowedRedirect(redirectUri);

    const nonce = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(`${nonce}${sessionId}${clientId}${provider}`).digest('base64url');
    const expiresAt = new Date(Date.now() + LINK_REQUEST_TTL_MS);

    await this.prisma.accountLinkRequest.create({
      data: {
        principalId: principal.sub,
        principalType: principal.principalType,
        provider,
        nonce,
        sessionId,
        expiresAt,
      },
    });

    const issuer = this.config.getOrThrow<string>('KEYCLOAK_ISSUER'); // e.g. http://keycloak:8080/realms/referralplatform
    const realmBase = issuer.replace(/\/realms\/.+$/, ''); // -> http://keycloak:8080
    const realm = issuer.split('/').filter(Boolean).pop();
    const linkUrl =
      `${realmBase}/realms/${realm}/broker/${provider}/link` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&nonce=${encodeURIComponent(nonce)}` +
      `&hash=${encodeURIComponent(hash)}`;

    return { linkUrl, expiresAt: expiresAt.toISOString() };
  }

  async list(principal: AuthenticatedPrincipal) {
    return this.keycloakAdmin.listFederatedIdentities(principal.sub);
  }

  async unlink(principal: AuthenticatedPrincipal, provider: string): Promise<void> {
    this.assertLinkable(provider);
    await this.keycloakAdmin.removeFederatedIdentity(principal.sub, provider);
    await this.auditOutbox.enqueueStandalone({
      type: 'identity.social_link.removed',
      actor: { principalType: principal.principalType, id: principal.sub },
      subject: { type: 'FederatedIdentity', id: `${principal.sub}:${provider}` },
      payload: { provider },
    });
  }

  /**
   * Called from a webhook/event once Keycloak confirms the link completed
   * (not yet wired to a real Keycloak event listener — see
   * BUILD_LOG/identity-access.md). Consumes the matching nonce (single-use)
   * and writes the audit trail entry.
   */
  async recordLinkCompleted(principal: AuthenticatedPrincipal, provider: string, nonce: string): Promise<void> {
    const request = await this.prisma.accountLinkRequest.findUnique({ where: { nonce } });
    if (!request || request.consumedAt || request.expiresAt < new Date() || request.principalId !== principal.sub) {
      throw new BadRequestException('No matching, unexpired account-link request for this nonce');
    }
    await this.prisma.accountLinkRequest.update({ where: { nonce }, data: { consumedAt: new Date() } });
    await this.auditOutbox.enqueueStandalone({
      type: 'identity.social_link.created',
      actor: { principalType: principal.principalType, id: principal.sub },
      subject: { type: 'FederatedIdentity', id: `${principal.sub}:${provider}` },
      payload: { provider },
    });
  }
}
