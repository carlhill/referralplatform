import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedPrincipal } from '@referralplatform/auth-client';
import { AccountLinksService } from './account-links.service';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import { PrismaService } from '../prisma/prisma.service';

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    KEYCLOAK_ISSUER: 'http://keycloak:8080/realms/referralplatform',
    KEYCLOAK_CLIENT_ID: 'identity-access-service',
    KEYCLOAK_CLIENT_SECRET: 'secret',
    AUDIT_LOG_SERVICE_URL: 'http://audit-log:3012',
    ACCOUNT_LINK_ALLOWED_ORIGINS: 'http://localhost:3100,http://localhost:3102,http://localhost:8081',
    ...overrides,
  };
  return {
    getOrThrow: (key: string) => values[key],
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  } as unknown as ConfigService;
}

const patient: AuthenticatedPrincipal = {
  sub: 'patient-1',
  principalType: 'patient',
  roles: ['patient'],
  raw: {},
};

function makeService(configOverrides: Record<string, string> = {}) {
  const prisma = {
    accountLinkRequest: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as jest.Mocked<PrismaService>;
  const keycloakAdmin = {
    listFederatedIdentities: jest.fn(),
    removeFederatedIdentity: jest.fn(),
  } as unknown as jest.Mocked<KeycloakAdminService>;
  const service = new AccountLinksService(prisma, keycloakAdmin, makeConfig(configOverrides));
  (service as any).auditClient = { record: jest.fn() };
  return { service, prisma, keycloakAdmin };
}

describe('AccountLinksService', () => {
  describe('createLinkUrl', () => {
    it('rejects myid — it is never a linkable secondary sign-in provider', async () => {
      const { service } = makeService();
      await expect(
        service.createLinkUrl(patient, 'myid', 'patient-web', 'http://localhost:3102/callback', 'sid-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an arbitrary/unknown provider', async () => {
      const { service } = makeService();
      await expect(
        service.createLinkUrl(patient, 'facebook', 'patient-web', 'http://localhost:3102/callback', 'sid-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a redirectUri outside the configured allow-list (open-redirect protection)', async () => {
      const { service } = makeService();
      await expect(
        service.createLinkUrl(patient, 'google', 'patient-web', 'https://evil.example.com/steal', 'sid-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('builds a Keycloak client-initiated-account-linking URL and persists the nonce', async () => {
      const { service, prisma } = makeService();

      const { linkUrl, expiresAt } = await service.createLinkUrl(
        patient,
        'google',
        'patient-web',
        'http://localhost:3102/callback',
        'sid-1',
      );

      expect(linkUrl).toMatch(
        /^http:\/\/keycloak:8080\/realms\/referralplatform\/broker\/google\/link\?client_id=patient-web&redirect_uri=/,
      );
      expect(linkUrl).toContain('&nonce=');
      expect(linkUrl).toContain('&hash=');
      expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

      expect(prisma.accountLinkRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            principalId: 'patient-1',
            provider: 'google',
            sessionId: 'sid-1',
          }),
        }),
      );
    });

    it('computes hash = base64url(sha256(nonce+sessionId+clientId+provider))', async () => {
      const { service, prisma } = makeService();
      const { linkUrl } = await service.createLinkUrl(
        patient,
        'microsoft',
        'gp-portal',
        'http://localhost:3100/callback',
        'sid-known',
      );
      const url = new URL(linkUrl);
      const nonce = url.searchParams.get('nonce')!;
      const hash = url.searchParams.get('hash')!;

      const { createHash } = await import('node:crypto');
      const expectedHash = createHash('sha256').update(`${nonce}sid-known${'gp-portal'}microsoft`).digest('base64url');

      expect(hash).toBe(expectedHash);
      expect(prisma.accountLinkRequest.create).toHaveBeenCalled();
    });
  });

  describe('unlink', () => {
    it('rejects myid for unlink too, and never calls the admin API for it', async () => {
      const { service, keycloakAdmin } = makeService();
      await expect(service.unlink(patient, 'myid')).rejects.toThrow(BadRequestException);
      expect(keycloakAdmin.removeFederatedIdentity).not.toHaveBeenCalled();
    });

    it('removes the federated identity and records an audit event', async () => {
      const { service, keycloakAdmin } = makeService();
      await service.unlink(patient, 'google');
      expect(keycloakAdmin.removeFederatedIdentity).toHaveBeenCalledWith('patient-1', 'google');
      expect((service as any).auditClient.record).toHaveBeenCalled();
    });
  });

  describe('recordLinkCompleted', () => {
    it('rejects a nonce with no matching, unexpired request for this principal', async () => {
      const { service, prisma } = makeService();
      (prisma.accountLinkRequest.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.recordLinkCompleted(patient, 'google', 'unknown-nonce')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('consumes a valid nonce exactly once', async () => {
      const { service, prisma } = makeService();
      (prisma.accountLinkRequest.findUnique as jest.Mock).mockResolvedValue({
        principalId: 'patient-1',
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      await service.recordLinkCompleted(patient, 'google', 'good-nonce');
      expect(prisma.accountLinkRequest.update).toHaveBeenCalledWith({
        where: { nonce: 'good-nonce' },
        data: { consumedAt: expect.any(Date) },
      });
    });
  });
});
