import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Thin wrapper so PrismaClient participates in Nest's DI/lifecycle
 * (connects on module init, disconnects on module destroy) — mirrored from
 * services/referral/src/prisma/prisma.service.ts (the reference copy every
 * service's Prisma wiring follows, per root CONVENTIONS.md).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
