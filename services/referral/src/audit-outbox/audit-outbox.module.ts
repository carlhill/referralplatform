import { Module } from '@nestjs/common';
import { AuditOutboxRelayService } from './audit-outbox-relay.service';

@Module({
  providers: [AuditOutboxRelayService],
})
export class AuditOutboxModule {}
