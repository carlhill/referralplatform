import { Module } from '@nestjs/common';
import { IdentityAccessClient } from './identity-access.client';

@Module({
  providers: [IdentityAccessClient],
  exports: [IdentityAccessClient],
})
export class IdentityAccessClientModule {}
