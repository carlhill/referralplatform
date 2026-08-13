import { Module } from '@nestjs/common';
import { ConcernsController } from './concerns.controller';
import { ConcernsService } from './concerns.service';
import { ConsentRecordsModule } from '../consent-records/consent-records.module';

@Module({
  imports: [ConsentRecordsModule],
  controllers: [ConcernsController],
  providers: [ConcernsService],
})
export class ConcernsModule {}
