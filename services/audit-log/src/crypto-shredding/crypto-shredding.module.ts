import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CryptoShreddingController } from './crypto-shredding.controller';
import { CryptoShreddingService } from './crypto-shredding.service';
import { KMS } from './kms.interface';
import { MockLocalKms } from './mock-local.kms';

/**
 * Binds the `Kms` interface (see kms.interface.ts) to the current
 * implementation, the same pattern as SigningModule for `Signer`. Swapping
 * in a real KMS/HSM integration later only touches this factory.
 */
@Global()
@Module({
  controllers: [CryptoShreddingController],
  providers: [
    {
      provide: KMS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new MockLocalKms(config.get<string>('KMS_MOCK_KEYSTORE_PATH', './local-dev-only-kms-keystore.json')),
    },
    CryptoShreddingService,
  ],
  exports: [KMS, CryptoShreddingService],
})
export class CryptoShreddingModule {}
