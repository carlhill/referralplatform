import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EXTRACTION_PROVIDER, type ExtractionProvider } from './extraction-provider.interface';
import { RuleBasedExtractionProvider } from './rule-based-extraction.provider';
import { LlmExtractionProvider } from './llm-extraction.provider';

/**
 * Wires up whichever ExtractionProvider is configured via
 * `EXTRACTION_PROVIDER` (`rule_based` [default] | `llm` — see
 * .env.example) behind the `EXTRACTION_PROVIDER` DI token, so
 * CasesService/CasesController never know or care which concrete
 * implementation is active — the whole point of module #10's "pluggable
 * ExtractionProvider interface" requirement.
 *
 * Both concrete providers are always registered (RuleBasedExtractionProvider
 * is also LlmExtractionProvider's MOCK fallback — see that file) so
 * switching the env var never requires a code change.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    RuleBasedExtractionProvider,
    LlmExtractionProvider,
    {
      provide: EXTRACTION_PROVIDER,
      useFactory: (
        config: ConfigService,
        ruleBased: RuleBasedExtractionProvider,
        llm: LlmExtractionProvider,
      ): ExtractionProvider => {
        const selected = config.get<string>('EXTRACTION_PROVIDER', 'rule_based');
        return selected === 'llm' ? llm : ruleBased;
      },
      inject: [ConfigService, RuleBasedExtractionProvider, LlmExtractionProvider],
    },
  ],
  exports: [EXTRACTION_PROVIDER, RuleBasedExtractionProvider, LlmExtractionProvider],
})
export class ExtractionModule {}
