import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global so every feature module (notifications, message-threads,
 * audit-outbox) can inject PrismaService without re-importing this module
 * everywhere — same pattern as services/onboarding-account/src/prisma.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
