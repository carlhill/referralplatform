import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditEventsModule } from './audit-events/audit-events.module';
import { CryptoShreddingModule } from './crypto-shredding/crypto-shredding.module';
import { HealthModule } from './health/health.module';
import { ImmudbModule } from './immudb/immudb.module';
import { PrismaModule } from './prisma/prisma.module';
import { SigningModule } from './signing/signing.module';

/**
 * Audit Log Service — immudb-backed, NASH-signed tamper-evident audit trail, plus its query/verification API.
 *
 * Module-per-domain-concept, per root CONVENTIONS.md:
 *  - PrismaModule / ImmudbModule: the two storage backends (see §5 exception for this service).
 *  - SigningModule: the pluggable NASH `Signer` (mock impl for now — see signing/mock-nash.signer.ts).
 *  - CryptoShreddingModule: the pluggable `Kms` + crypto-shredding logic (mock impl for now — see crypto-shredding/mock-local.kms.ts).
 *  - AuditEventsModule: the write + query/verification API itself.
 * Keep AppModule itself thin: wiring only, no business logic.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    HealthModule,
    PrismaModule,
    ImmudbModule,
    SigningModule,
    CryptoShreddingModule,
    AuditEventsModule,
  ],
})
export class AppModule {}
