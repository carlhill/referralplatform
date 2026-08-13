import { Module } from '@nestjs/common';
import { MockMyIdController } from './mock-myid.controller';
import { MockMyIdService } from './mock-myid.service';

/** MOCK — replace with real integration. See mock-myid.service.ts. */
@Module({
  controllers: [MockMyIdController],
  providers: [MockMyIdService],
})
export class MockMyIdModule {}
