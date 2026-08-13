import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockNashSigner } from './mock-nash.signer';
import { NASH_SIGNER } from './signer.interface';

/**
 * Binds the `Signer` interface (see signer.interface.ts) to the current
 * implementation. Swapping in a real NASH/HSM-backed signer later is a
 * one-line change here — no call site (AuditEventsService) needs to change,
 * since it only depends on the `Signer` interface via the NASH_SIGNER token.
 */
@Global()
@Module({
  providers: [
    {
      provide: NASH_SIGNER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new MockNashSigner(config.get<string>('NASH_SIGNING_KEY_PATH', './local-dev-only-nash-key.pem')),
    },
  ],
  exports: [NASH_SIGNER],
})
export class SigningModule {}
