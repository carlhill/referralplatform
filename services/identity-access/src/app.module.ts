import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { requireAuth } from '@referralplatform/auth-client';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { KeycloakAdminModule } from './keycloak-admin/keycloak-admin.module';
import { PasskeysModule } from './passkeys/passkeys.module';
import { PasskeysController } from './passkeys/passkeys.controller';
import { AccountLinksModule } from './account-links/account-links.module';
import { AccountLinksController } from './account-links/account-links.controller';
import { MockMyIdModule } from './mock-myid/mock-myid.module';
import { createTokenVerifier } from './common/clients';

/**
 * Identity & Access Service — authenticates every user type, issues/validates passkeys and OIDC tokens, hosts the myID relying-party integration. Built on Keycloak.
 *
 * Registration/login for passkeys and every principal type's OIDC session
 * itself is Keycloak's job (see infra/keycloak/realm-export.json — the
 * realm's WebAuthn policy and the `clinician-browser` /
 * `patient-carer-browser` custom authentication flows). What this service
 * owns and exposes as real HTTP endpoints:
 *  - PasskeysModule: list/revoke a caller's own WebAuthn credentials, and
 *    force re-enrolment (GP-assisted recovery), via Keycloak's Admin API.
 *  - AccountLinksModule: the ONE place a Google/Microsoft secondary sign-in
 *    link can be initiated — every route requires an already-authenticated
 *    caller (see the `configure()` wiring below), which is what makes
 *    "social login never creates or activates an account" enforced, not
 *    just documented (see account-links.service.ts).
 *  - MockMyIdModule: a mocked myID (TDIF) OIDC identity provider Keycloak's
 *    `myid` broker points at in local dev — MOCK, see mock-myid.service.ts.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    HealthModule,
    PrismaModule,
    KeycloakAdminModule,
    PasskeysModule,
    AccountLinksModule,
    MockMyIdModule,
  ],
})
export class AppModule implements NestModule {
  constructor(private readonly config: ConfigService) {}

  configure(consumer: MiddlewareConsumer): void {
    // Every controller listed here requires a verified bearer token before
    // any handler runs — see common/authenticated-request.ts. Controllers
    // NOT listed here (HealthController, MockMyIdController) are
    // deliberately public — see each for why.
    const verifier = createTokenVerifier(this.config);
    consumer.apply(requireAuth(verifier)).forRoutes(PasskeysController, AccountLinksController);
  }
}
