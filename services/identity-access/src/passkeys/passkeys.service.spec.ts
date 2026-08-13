import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@referralplatform/auth-client';
import { PasskeysService } from './passkeys.service';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';

function makeConfig(): ConfigService {
  return {
    getOrThrow: (key: string) =>
      ({
        KEYCLOAK_ISSUER: 'http://keycloak:8080/realms/referralplatform',
        KEYCLOAK_CLIENT_ID: 'identity-access-service',
        KEYCLOAK_CLIENT_SECRET: 'secret',
        AUDIT_LOG_SERVICE_URL: 'http://audit-log:3012',
      })[key],
    get: () => undefined,
  } as unknown as ConfigService;
}

const gp: AuthenticatedPrincipal = {
  sub: 'user-1',
  principalType: 'gp',
  roles: ['gp'],
  raw: {},
};

describe('PasskeysService', () => {
  function makeService() {
    const keycloakAdmin = {
      listCredentials: jest.fn(),
      deleteCredential: jest.fn(),
      addRequiredAction: jest.fn(),
    } as unknown as jest.Mocked<KeycloakAdminService>;
    const service = new PasskeysService(keycloakAdmin, makeConfig());
    // Swap in a fetch-free audit client stand-in so tests don't hit the network.
    (service as any).auditClient = { record: jest.fn() };
    return { service, keycloakAdmin };
  }

  it('lists only webauthn/webauthn-passwordless credentials, mapped to a clean summary', async () => {
    const { service, keycloakAdmin } = makeService();
    keycloakAdmin.listCredentials.mockResolvedValue([
      { id: 'c1', type: 'password' },
      { id: 'c2', type: 'webauthn-passwordless', userLabel: "Carl's iPhone", createdDate: 1700000000000 },
      { id: 'c3', type: 'webauthn', createdDate: 1700000001000 },
    ] as any);

    const result = await service.list(gp);

    expect(result).toEqual([
      { id: 'c2', label: "Carl's iPhone", registeredAt: new Date(1700000000000).toISOString(), isPasswordless: true },
      { id: 'c3', label: 'Passkey', registeredAt: new Date(1700000001000).toISOString(), isPasswordless: false },
    ]);
    expect(keycloakAdmin.listCredentials).toHaveBeenCalledWith('user-1');
  });

  it('revokes a credential the caller owns and records an audit event', async () => {
    const { service, keycloakAdmin } = makeService();
    keycloakAdmin.listCredentials.mockResolvedValue([{ id: 'c2', type: 'webauthn-passwordless' }] as any);

    await service.revoke(gp, 'c2');

    expect(keycloakAdmin.deleteCredential).toHaveBeenCalledWith('user-1', 'c2');
    expect((service as any).auditClient.record).toHaveBeenCalledWith(
      expect.objectContaining({ subject: { type: 'WebAuthnCredential', id: 'c2' } }),
    );
  });

  it("refuses to revoke a credential id not present in the caller's own list", async () => {
    const { service, keycloakAdmin } = makeService();
    keycloakAdmin.listCredentials.mockResolvedValue([{ id: 'c2', type: 'webauthn-passwordless' }] as any);

    await expect(service.revoke(gp, 'someone-elses-credential')).rejects.toThrow(NotFoundException);
    expect(keycloakAdmin.deleteCredential).not.toHaveBeenCalled();
  });

  it('requires the hardware/passwordless required action for GP/specialist principals', async () => {
    const { service, keycloakAdmin } = makeService();
    await service.requireReenrolment(gp);
    expect(keycloakAdmin.addRequiredAction).toHaveBeenCalledWith('user-1', 'webauthn-register');
  });

  it('requires the passwordless (passkey) required action for patient/carer principals', async () => {
    const { service, keycloakAdmin } = makeService();
    await service.requireReenrolment({ ...gp, principalType: 'patient' });
    expect(keycloakAdmin.addRequiredAction).toHaveBeenCalledWith('user-1', 'webauthn-register-passwordless');
  });
});
