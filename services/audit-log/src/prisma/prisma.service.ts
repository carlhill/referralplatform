import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Thin Prisma wrapper following the standard NestJS pattern (connect on
 * module init, disconnect on shutdown). This service's own Postgres schema
 * (`audit_log`) holds only relational query-index metadata — see
 * prisma/schema.prisma's AuditEventIndex model and
 * claude/audit-log-architecture-decision.md. The audit entries themselves
 * live in immudb (see ../immudb/immudb.service.ts), never here.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to Postgres (audit_log schema)');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
