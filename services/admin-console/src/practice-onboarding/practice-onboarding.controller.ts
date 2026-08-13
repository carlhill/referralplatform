import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { BearerAuthGuard } from '../common/bearer-auth.guard';
import { actorFrom, requireStaff } from '../common/staff';
import type { AuthenticatedRequest } from '../common/authenticated-request';
import { PracticeOnboardingService } from './practice-onboarding.service';
import { CreatePracticeOnboardingCaseDto } from './dto/create-practice-onboarding-case.dto';
import { AdvanceStageDto } from './dto/advance-stage.dto';
import { ListPracticeOnboardingCasesQueryDto } from './dto/list-practice-onboarding-cases.query.dto';

/** ui-design.md Admin/Ops Console screen 3 — PHN/practice onboarding pipeline management. */
@Controller('practice-onboarding-cases')
@UseGuards(BearerAuthGuard)
export class PracticeOnboardingController {
  constructor(private readonly practiceOnboarding: PracticeOnboardingService) {}

  @Post()
  async create(@Body() dto: CreatePracticeOnboardingCaseDto, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return this.practiceOnboarding.create(dto, actorFrom(req));
  }

  @Get()
  async list(@Query() query: ListPracticeOnboardingCasesQueryDto, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return this.practiceOnboarding.list(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return this.practiceOnboarding.getById(id);
  }

  @Post(':id/refresh')
  async refresh(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return this.practiceOnboarding.refresh(id);
  }

  @Post(':id/advance-stage')
  async advanceStage(@Param('id') id: string, @Body() dto: AdvanceStageDto, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return this.practiceOnboarding.advanceStage(id, dto, actorFrom(req));
  }

  @Post(':id/assign')
  async assign(@Param('id') id: string, @Body('staffId') staffId: string | null, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return this.practiceOnboarding.assign(id, staffId ?? null);
  }
}
