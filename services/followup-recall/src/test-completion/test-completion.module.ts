import { Module } from '@nestjs/common';
import { FollowUpPlansModule } from '../follow-up-plans/follow-up-plans.module';
import { TestCompletionDetectionScheduler } from './test-completion-detection.scheduler';

@Module({
  imports: [FollowUpPlansModule],
  providers: [TestCompletionDetectionScheduler],
})
export class TestCompletionModule {}
