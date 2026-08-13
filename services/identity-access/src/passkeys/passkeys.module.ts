import { Module } from '@nestjs/common';
import { KeycloakAdminModule } from '../keycloak-admin/keycloak-admin.module';
import { PasskeysController } from './passkeys.controller';
import { PasskeysService } from './passkeys.service';

@Module({
  imports: [KeycloakAdminModule],
  controllers: [PasskeysController],
  providers: [PasskeysService],
})
export class PasskeysModule {}
