import { Module } from '@nestjs/common';
import { ConsentRecordsController, ReferralVisibilityController } from './consent-records.controller';
import { ConsentRecordsService } from './consent-records.service';

@Module({
  controllers: [ConsentRecordsController, ReferralVisibilityController],
  providers: [ConsentRecordsService],
  exports: [ConsentRecordsService],
})
export class ConsentRecordsModule {}
