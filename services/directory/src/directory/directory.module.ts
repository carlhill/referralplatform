import { Module } from '@nestjs/common';
import { DirectoryController } from './directory.controller';
import { DirectoryService } from './directory.service';
import { NhsdSyncService } from './nhsd-sync/nhsd-sync.service';
import { NHSD_DIRECTORY_CLIENT } from './nhsd-sync/nhsd-client.interface';
import { MockNhsdDirectoryClient } from './nhsd-sync/mock-nhsd-client';
import { HEALTHPATHWAYS_CLIENT } from './healthpathways/healthpathways-client.interface';
import { MockHealthPathwaysClient } from './healthpathways/mock-healthpathways-client';

@Module({
  controllers: [DirectoryController],
  providers: [
    DirectoryService,
    NhsdSyncService,
    { provide: NHSD_DIRECTORY_CLIENT, useClass: MockNhsdDirectoryClient },
    { provide: HEALTHPATHWAYS_CLIENT, useClass: MockHealthPathwaysClient },
  ],
  exports: [DirectoryService, NhsdSyncService],
})
export class DirectoryModule {}
