import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { ComplianceRulesController } from './compliance-rules.controller';
import { ComplianceRulesService } from './compliance-rules.service';

/**
 * Seeds the real WWCC/child/DV/complex rule data on boot (idempotent — see
 * ComplianceRulesService.seedDefaults()), so a freshly-migrated database has
 * a usable ruleset without a manual ops step.
 */
@Module({
  controllers: [ComplianceRulesController],
  providers: [ComplianceRulesService],
  exports: [ComplianceRulesService],
})
export class ComplianceRulesModule implements OnModuleInit {
  private readonly logger = new Logger(ComplianceRulesModule.name);

  constructor(private readonly rules: ComplianceRulesService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.rules.seedDefaults();
    } catch (err) {
      // Don't crash the service if Postgres isn't reachable yet at boot
      // (e.g. this sandbox, or a slow-starting compose dependency) — the
      // `POST /compliance-rules/seed` endpoint and container restart both
      // retry this.
      this.logger.error(
        'Failed to seed default compliance rules at boot — will need a manual POST /compliance-rules/seed once the database is reachable',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
