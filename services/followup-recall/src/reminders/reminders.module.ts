import { Module } from '@nestjs/common';
import { DeceasedSuppressionModule } from '../deceased-suppression/deceased-suppression.module';
import { ReminderDispatchScheduler } from './reminder-dispatch.scheduler';
import { ReminderEscalationScheduler } from './reminder-escalation.scheduler';

@Module({
  imports: [DeceasedSuppressionModule],
  providers: [ReminderDispatchScheduler, ReminderEscalationScheduler],
})
export class RemindersModule {}
