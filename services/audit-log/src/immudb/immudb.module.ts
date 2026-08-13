import { Global, Module } from '@nestjs/common';
import { ImmudbService } from './immudb.service';

/** Global — every module that needs tamper-evident storage injects ImmudbService directly. */
@Global()
@Module({
  providers: [ImmudbService],
  exports: [ImmudbService],
})
export class ImmudbModule {}
