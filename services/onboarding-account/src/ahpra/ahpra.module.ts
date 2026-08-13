import { Module } from '@nestjs/common';
import { AhpraVerificationClient } from './ahpra.interface';
import { MockAhpraVerificationClient } from './ahpra.mock';

@Module({
  providers: [{ provide: AhpraVerificationClient, useClass: MockAhpraVerificationClient }],
  exports: [AhpraVerificationClient],
})
export class AhpraModule {}
