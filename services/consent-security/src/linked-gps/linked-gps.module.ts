import { Module } from '@nestjs/common';
import { LinkedGpsController } from './linked-gps.controller';
import { LinkedGpsService } from './linked-gps.service';

@Module({
  controllers: [LinkedGpsController],
  providers: [LinkedGpsService],
})
export class LinkedGpsModule {}
