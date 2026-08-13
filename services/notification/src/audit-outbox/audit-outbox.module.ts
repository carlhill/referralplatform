import { Module } from '@nestjs/common';
import { AuditOutboxService } from './audit-outbox.service';
import { AuditOutboxRelayService } from './audit-outbox-relay.service';

@Module({
  providers: [AuditOutboxService, AuditOutboxRelayService],
  exports: [AuditOutboxService],
})
export class AuditOutboxModule {}
