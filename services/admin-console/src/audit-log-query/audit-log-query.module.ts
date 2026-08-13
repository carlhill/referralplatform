import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuditClient } from '@referralplatform/audit-client';
import { createAuditClient } from '../common/clients';
import { AuditLogQueryController } from './audit-log-query.controller';

@Module({
  imports: [ConfigModule],
  controllers: [AuditLogQueryController],
  providers: [{ provide: AuditClient, useFactory: (config: ConfigService) => createAuditClient(config), inject: [ConfigService] }],
})
export class AuditLogQueryModule {}
