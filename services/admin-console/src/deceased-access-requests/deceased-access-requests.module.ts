import { Module } from '@nestjs/common';
import { DeceasedAccessRequestsController } from './deceased-access-requests.controller';

/** ConsentSecurityClient is provided globally by ExternalClientsModule (see common/external-clients.module.ts). */
@Module({
  controllers: [DeceasedAccessRequestsController],
})
export class DeceasedAccessRequestsModule {}
