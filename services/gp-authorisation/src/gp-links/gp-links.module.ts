import { Module } from '@nestjs/common';
import { GpLinksController } from './gp-links.controller';
import { GpLinksService } from './gp-links.service';
import { GpLinkExpiryScheduler } from './gp-link-expiry.scheduler';

@Module({
  controllers: [GpLinksController],
  providers: [GpLinksService, GpLinkExpiryScheduler],
  exports: [GpLinksService],
})
export class GpLinksModule {}
