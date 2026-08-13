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
import { FollowUpPlansService } from './follow-up-plans.service';
import { CreateFollowUpPlanDto } from './dto/create-follow-up-plan.dto';
import { SelfReportCompletionDto } from './dto/self-report-completion.dto';
import { TestResultWebhookDto } from './dto/test-result-webhook.dto';
import { BearerAuthGuard } from '../common/bearer-auth.guard';
import type { AuthenticatedRequest } from '../common/authenticated-request';

/**
 * Follow-up & Recall Service HTTP API — module #7 of business-process-
 * flow.md. See BUILD_LOG/followup-recall.md for the full endpoint list and
 * design rationale.
 */
@Controller('follow-up-plans')
@UseGuards(BearerAuthGuard)
export class FollowUpPlansController {
  constructor(private readonly plans: FollowUpPlansService) {}

  private principal(req: AuthenticatedRequest) {
    if (!req.auth) {
      throw new UnauthorizedException('Authentication required');
    }
    return req.auth;
  }

  private actorFrom(req: AuthenticatedRequest): ActorRef {
    const p = this.principal(req);
    return {
      principalType: p.principalType,
      id: p.sub,
      healthcareIdentifier: p.healthcareIdentifier as any,
      displayName: p.preferredUsername,
    };
  }

  /** The specialist's structured Follow-up Plan, created at the end of a consult. */
  @Post()
  async create(@Body() dto: CreateFollowUpPlanDto, @Req() req: AuthenticatedRequest) {
    const principal = this.principal(req);
    if (principal.principalType !== 'specialist' && principal.principalType !== 'internal_staff') {
      throw new ForbiddenException('Only the treating specialist (or internal staff on their behalf) may create a Follow-up Plan');
    }
    return this.plans.create(dto, this.actorFrom(req));
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.plans.findById(id);
  }

  @Get()
  async listForPatient(@Query('patientId') patientId: string, @Query('status') status?: string) {
    return this.plans.listForPatient(patientId, status);
  }

  /** Self-report fallback — business-process-flow.md module 6. Open to patient/carer/GP principals. */
  @Post(':id/self-report')
  async selfReport(
    @Param('id') id: string,
    @Body() dto: SelfReportCompletionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const principal = this.principal(req);
    if (!['patient', 'carer', 'gp'].includes(principal.principalType)) {
      throw new ForbiddenException('Only the patient, their carer, or the GP may self-report test completion');
    }
    return this.plans.recordTestCompletion(id, 'patient_self_report', this.actorFrom(req), {
      reportedBy: dto.reportedBy,
      note: dto.note,
    });
  }

  /**
   * Automatic-detection hit — called by TestCompletionDetectionScheduler
   * (internal system principal) after a positive result from the mock
   * pathology/My Health Record clients, and left open as the same shape a
   * real pathology/My Health Record push integration would call directly.
   */
  @Post(':id/test-result')
  async testResult(@Param('id') id: string, @Body() dto: TestResultWebhookDto, @Req() req: AuthenticatedRequest) {
    const principal = this.principal(req);
    if (principal.principalType !== 'system' && principal.principalType !== 'internal_staff') {
      throw new ForbiddenException('Only a system principal (the detection scheduler) may report automatic test-completion detection');
    }
    return this.plans.recordTestCompletion(id, dto.detectedVia, this.actorFrom(req), {
      testName: dto.testName,
      resultDate: dto.resultDate,
    });
  }
}
