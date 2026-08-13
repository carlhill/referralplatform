import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BearerAuthGuard } from '../common/bearer-auth.guard';
import { actorFrom, requireStaff } from '../common/staff';
import { assertStepUp } from '../common/step-up';
import type { AuthenticatedRequest } from '../common/authenticated-request';
import { VerificationCasesService } from './verification-cases.service';
import { OpenVerificationCaseDto } from './dto/open-verification-case.dto';
import { DecideVerificationCaseDto } from './dto/decide-verification-case.dto';
import { ListVerificationCasesQueryDto } from './dto/list-verification-cases.query.dto';

/** ui-design.md Admin/Ops Console screen 1 — AHPRA/WWCC manual verification review queue. */
@Controller('verification-cases')
@UseGuards(BearerAuthGuard)
export class VerificationCasesController {
  constructor(
    private readonly verificationCases: VerificationCasesService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  async open(@Body() dto: OpenVerificationCaseDto, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return this.verificationCases.open(dto, actorFrom(req));
  }

  @Get()
  async list(@Query() query: ListVerificationCasesQueryDto, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return this.verificationCases.list(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return this.verificationCases.getById(id);
  }

  /** Re-pulls the automated verification status from onboarding-account — never itself decides the case. */
  @Post(':id/refresh')
  async refresh(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return this.verificationCases.refresh(id);
  }

  @Post(':id/assign')
  async assign(@Param('id') id: string, @Body('staffId') staffId: string | null, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return this.verificationCases.assign(id, staffId ?? null);
  }

  @Post(':id/needs-info')
  async needsInfo(@Param('id') id: string, @Body() dto: DecideVerificationCaseDto, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return this.verificationCases.needsInfo(id, actorFrom(req), dto.decisionNote);
  }

  /**
   * Step-up gated — root CONVENTIONS.md §8 names "approving a new GP link"
   * / "granting deceased-patient access" as the worked examples this
   * mirrors: approving an AHPRA/WWCC verification is an equally sensitive
   * decision action this console exposes directly.
   */
  @Post(':id/approve')
  async approve(@Param('id') id: string, @Body() dto: DecideVerificationCaseDto, @Req() req: AuthenticatedRequest) {
    const principal = requireStaff(req);
    assertStepUp(principal!, this.config.get<string>('STEP_UP_ACR', 'passkey'));
    return this.verificationCases.approve(id, actorFrom(req), dto.decisionNote);
  }

  @Post(':id/reject')
  async reject(@Param('id') id: string, @Body() dto: DecideVerificationCaseDto, @Req() req: AuthenticatedRequest) {
    const principal = requireStaff(req);
    assertStepUp(principal!, this.config.get<string>('STEP_UP_ACR', 'passkey'));
    return this.verificationCases.reject(id, actorFrom(req), dto.decisionNote);
  }
}
