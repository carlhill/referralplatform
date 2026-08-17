import { Module } from '@nestjs/common';
import { KeycloakAdminModule } from '../keycloak-admin/keycloak-admin.module';
import { PasskeysController } from './passkeys.controller';
import { PasskeysService } from './passkeys.service';
import { ClinicianCredentialReconciler } from './clinician-credential-reconciler.service';

@Module({
  imports: [KeycloakAdminModule],
  controllers: [PasskeysController],
  providers: [PasskeysService, ClinicianCredentialReconciler],
})
export class PasskeysModule {}
