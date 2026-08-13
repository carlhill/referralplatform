import { Module } from '@nestjs/common';
import { SpecialistsController } from './specialists.controller';
import { SpecialistsService } from './specialists.service';
import { AhpraModule } from '../ahpra/ahpra.module';
import { HiServiceModule } from '../hi-service/hi-service.module';
import { NashModule } from '../nash/nash.module';
import { DirectoryClientModule } from '../directory-client/directory-client.module';
import { AuditOutboxModule } from '../audit-outbox/audit-outbox.module';

@Module({
  imports: [AhpraModule, HiServiceModule, NashModule, DirectoryClientModule, AuditOutboxModule],
  controllers: [SpecialistsController],
  providers: [SpecialistsService],
  exports: [SpecialistsService],
})
export class SpecialistsModule {}
