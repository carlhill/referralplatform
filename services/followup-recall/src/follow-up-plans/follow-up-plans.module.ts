import { Module } from '@nestjs/common';
import { FollowUpPlansController } from './follow-up-plans.controller';
import { FollowUpPlansService } from './follow-up-plans.service';

@Module({
  controllers: [FollowUpPlansController],
  providers: [FollowUpPlansService],
  exports: [FollowUpPlansService],
})
export class FollowUpPlansModule {}
