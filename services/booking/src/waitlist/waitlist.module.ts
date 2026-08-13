import { Module } from '@nestjs/common';
import { WaitlistService } from './waitlist.service';
import { SlotsModule } from '../booking/slots.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [SlotsModule, CommonModule],
  providers: [WaitlistService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
