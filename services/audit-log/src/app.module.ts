import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';

/**
 * Audit Log Service — immudb-backed, NASH-signed tamper-evident audit trail, plus its query/verification API.
 *
 * This module list grows as the service's real functionality is built —
 * see root CONVENTIONS.md for the module-per-domain-concept pattern
 * (e.g. a future PrismaModule, plus one module per bounded concern this
 * service owns). Keep AppModule itself thin: wiring only, no business logic.
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }), HealthModule],
})
export class AppModule {}
