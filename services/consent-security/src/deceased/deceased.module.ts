import { Module } from '@nestjs/common';
import { DeceasedFlagsController } from './deceased-flags.controller';
import { DeceasedFlagsService } from './deceased-flags.service';
import { AccessRequestsController } from './access-requests.controller';
import { AccessRequestsService } from './access-requests.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [DeceasedFlagsController, AccessRequestsController],
  providers: [DeceasedFlagsService, AccessRequestsService],
})
export class DeceasedModule {}
