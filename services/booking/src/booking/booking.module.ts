import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { SlotsController } from './slots.controller';
import { BookingService } from './booking.service';
import { SlotsModule } from './slots.module';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { CalendarModule } from '../calendar/calendar.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [SlotsModule, WaitlistModule, CalendarModule, CommonModule],
  controllers: [BookingController, SlotsController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
