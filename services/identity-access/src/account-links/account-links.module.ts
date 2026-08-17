import { Module } from '@nestjs/common';
import { AuditOutboxModule } from '../audit-outbox/audit-outbox.module';
import { KeycloakAdminModule } from '../keycloak-admin/keycloak-admin.module';
import { AccountLinksController } from './account-links.controller';
import { AccountLinksService } from './account-links.service';

@Module({
  imports: [AuditOutboxModule, KeycloakAdminModule],
  controllers: [AccountLinksController],
  providers: [AccountLinksService],
})
export class AccountLinksModule {}
