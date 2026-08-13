import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';

/**
 * Booking Service — calendar free/busy sync, preference capture and matching, waitlist management, urgent fast-path, cancellation/dual-notification.
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
