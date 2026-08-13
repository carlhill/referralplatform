import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { ComplianceRulesService, evaluateAgainstRules } from './compliance-rules.service';
import { CreateComplianceRuleDto } from './dto/create-compliance-rule.dto';
import { EvaluateComplianceDto } from './dto/evaluate-compliance.dto';
import { BearerAuthGuard } from '../common/bearer-auth.guard';
import type { AuthenticatedRequest } from '../common/authenticated-request';

/**
 * Compliance Rules Engine HTTP API — module #6 of modules-and-requirements.md.
 * See BUILD_LOG/referral.md for design rationale.
 */
@Controller('compliance-rules')
export class ComplianceRulesController {
  constructor(private readonly rules: ComplianceRulesService) {}

  private actorFrom(req: AuthenticatedRequest): ActorRef {
    if (!req.auth) {
      throw new UnauthorizedException('Authentication required');
    }
    return {
      principalType: req.auth.principalType,
      id: req.auth.sub,
      healthcareIdentifier: req.auth.healthcareIdentifier as any,
      displayName: req.auth.preferredUsername,
    };
  }

  @Get()
  @UseGuards(BearerAuthGuard)
  async list(@Query('category') category?: string, @Query('jurisdiction') jurisdiction?: string) {
    return this.rules.listActive(category, jurisdiction);
  }

  @Get(':id')
  @UseGuards(BearerAuthGuard)
  async getById(@Param('id') id: string) {
    return this.rules.getById(id);
  }

  /** Preview: which flags would this referral raise, without creating one. See EvaluateComplianceDto. */
  @Post('evaluate')
  @UseGuards(BearerAuthGuard)
  async evaluate(@Body() dto: EvaluateComplianceDto) {
    const matched = await this.rules.evaluate({
      gpState: dto.gpState as any,
      patientIsMinor: dto.patientIsMinor ?? false,
      dvIndicated: dto.dvIndicated ?? false,
      complexCase: dto.complexCase ?? false,
    });
    return { matched };
  }

  /**
   * Publishes a new rule version — compliance staff only, per
   * modules-and-requirements.md ("editable by authorised compliance staff
   * without a code deploy").
   */
  @Post()
  @UseGuards(BearerAuthGuard)
  async create(@Body() dto: CreateComplianceRuleDto, @Req() req: AuthenticatedRequest) {
    if (req.auth?.principalType !== 'internal_staff') {
      throw new ForbiddenException('Only internal compliance staff may publish a new compliance rule version');
    }
    return this.rules.createNewVersion(dto, this.actorFrom(req));
  }

  /** Re-runs the idempotent default-rule seed — ops/recovery, internal staff only. */
  @Post('seed')
  @UseGuards(BearerAuthGuard)
  async seed(@Req() req: AuthenticatedRequest) {
    if (req.auth?.principalType !== 'internal_staff' && req.auth?.principalType !== 'system') {
      throw new ForbiddenException('Only internal staff or a system principal may re-run the compliance rules seed');
    }
    const seeded = await this.rules.seedDefaults();
    return { seeded };
  }
}

// Re-exported for compliance-rules.service.spec.ts's convenience import path stability.
export { evaluateAgainstRules };
