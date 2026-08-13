import { Module } from '@nestjs/common';
import { NashCredentialClient } from './nash.interface';
import { MockNashCredentialClient } from './nash.mock';

@Module({
  providers: [{ provide: NashCredentialClient, useClass: MockNashCredentialClient }],
  exports: [NashCredentialClient],
})
export class NashModule {}
