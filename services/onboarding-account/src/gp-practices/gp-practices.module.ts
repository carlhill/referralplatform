import { Module } from '@nestjs/common';
import { GpPracticesController } from './gp-practices.controller';
import { GpPracticesService } from './gp-practices.service';
import { HiServiceModule } from '../hi-service/hi-service.module';
import { AuditOutboxModule } from '../audit-outbox/audit-outbox.module';

@Module({
  imports: [HiServiceModule, AuditOutboxModule],
  controllers: [GpPracticesController],
  providers: [GpPracticesService],
  exports: [GpPracticesService],
})
export class GpPracticesModule {}
