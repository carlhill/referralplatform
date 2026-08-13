import { Module } from '@nestjs/common';
import { HiServiceClient } from './hi-service.interface';
import { MockHiServiceClient } from './hi-service.mock';

/**
 * Binds the abstract `HiServiceClient` token to the MOCK implementation for
 * this build. Swapping in a real Healthcare Identifiers Service integration
 * later is a one-line change here (`useClass: RealHiServiceClient`) — no
 * caller in src/onboarding, src/gp-practices, or src/specialists needs to
 * change, since they all depend on the abstract class, not the mock.
 */
@Module({
  providers: [{ provide: HiServiceClient, useClass: MockHiServiceClient }],
  exports: [HiServiceClient],
})
export class HiServiceModule {}
