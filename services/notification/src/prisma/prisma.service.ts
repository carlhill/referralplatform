import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Standard NestJS wrapper around the generated Prisma client for this
 * service's own `notification` Postgres schema — see root CONVENTIONS.md
 * ("Database access"). Connects on module init, disconnects cleanly on
 * shutdown so tests and `docker compose down` don't leak connections.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
