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
import { CasesService } from './cases.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { ExtractDto } from './dto/extract.dto';
import { ConfirmExtractionDto } from './dto/confirm-extraction.dto';
import { RejectExtractionDto } from './dto/reject-extraction.dto';
import { BranchDecisionDto } from './dto/branch-decision.dto';
import { PathologyRequestDto } from './dto/pathology-request.dto';
import { CancelCaseDto } from './dto/cancel-case.dto';
import { ListCasesQueryDto } from './dto/list-cases.query.dto';
import { BearerAuthGuard } from '../common/bearer-auth.guard';
import type { AuthenticatedRequest } from '../common/authenticated-request';

/**
 * Specialist Review Service HTTP API — module #10/#5 of
 * modules-and-requirements.md. See BUILD_LOG/specialist-review.md for the
 * full endpoint list and design rationale.
 */
@Controller('cases')
export class CasesController {
  constructor(private readonly cases: CasesService) {}

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

  /** Strips the leading "Bearer " so it can be forwarded onward by ReferralServiceClient. */
  private bearerToken(req: AuthenticatedRequest): string {
    const header = req.headers['authorization'];
    const value = Array.isArray(header) ? header[0] : header;
    return value!.slice('Bearer '.length);
  }

  private requireSpecialistOrStaff(req: AuthenticatedRequest, action: string): void {
    const principal = this.principal(req);
    if (principal.principalType !== 'specialist' && principal.principalType !== 'internal_staff') {
      throw new ForbiddenException(`Only the receiving specialist or internal staff may ${action}`);
    }
  }

  /** Intended real caller: the Referral/Booking Service once a referral reaches 'booked'. */
  @Post()
  @UseGuards(BearerAuthGuard)
  async create(@Body() dto: CreateCaseDto, @Req() req: AuthenticatedRequest) {
    const principal = this.principal(req);
    if (
      principal.principalType !== 'system' &&
      principal.principalType !== 'internal_staff' &&
      principal.principalType !== 'specialist'
    ) {
      throw new ForbiddenException('Only a system principal, internal staff, or the specialist may create a case');
    }
    return this.cases.createCase(dto, this.actorFrom(req));
  }

  @Get()
  @UseGuards(BearerAuthGuard)
  async list(@Query() query: ListCasesQueryDto) {
    return this.cases.listCases(query);
  }

  @Get(':id')
  @UseGuards(BearerAuthGuard)
  async getById(@Param('id') id: string) {
    return this.cases.getCase(id);
  }

  /** Runs the pluggable ExtractionProvider. Produces a review-only summary — see CasesService's class doc comment. */
  @Post(':id/extract')
  @UseGuards(BearerAuthGuard)
  async extract(@Param('id') id: string, @Body() dto: ExtractDto, @Req() req: AuthenticatedRequest) {
    this.requireSpecialistOrStaff(req, 'run extraction');
    return this.cases.runExtraction(id, dto, this.actorFrom(req));
  }

  @Get(':id/extractions')
  @UseGuards(BearerAuthGuard)
  async extractions(@Param('id') id: string) {
    return this.cases.listExtractions(id);
  }

  /** The explicit-confirmation gate every downstream action depends on. */
  @Post(':id/extractions/:extractionId/confirm')
  @UseGuards(BearerAuthGuard)
  async confirm(
    @Param('id') id: string,
    @Param('extractionId') extractionId: string,
    @Body() dto: ConfirmExtractionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    this.requireSpecialistOrStaff(req, 'confirm an AI-extracted summary');
    return this.cases.confirmExtraction(id, extractionId, dto, this.actorFrom(req));
  }

  @Post(':id/extractions/:extractionId/reject')
  @UseGuards(BearerAuthGuard)
  async reject(
    @Param('id') id: string,
    @Param('extractionId') extractionId: string,
    @Body() dto: RejectExtractionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    this.requireSpecialistOrStaff(req, 'reject an AI-extracted summary');
    return this.cases.rejectExtraction(id, extractionId, dto, this.actorFrom(req));
  }

  /** eConsult-vs-full-appointment branch decision — module 5's "S2" fork. Requires a confirmed extraction. */
  @Post(':id/branch-decision')
  @UseGuards(BearerAuthGuard)
  async decideBranch(@Param('id') id: string, @Body() dto: BranchDecisionDto, @Req() req: AuthenticatedRequest) {
    this.requireSpecialistOrStaff(req, 'decide the eConsult/full-appointment branch');
    return this.cases.decideBranch(id, dto, this.actorFrom(req), this.bearerToken(req));
  }

  @Get(':id/decisions')
  @UseGuards(BearerAuthGuard)
  async decisions(@Param('id') id: string) {
    return this.cases.listDecisions(id);
  }

  /** Pre-visit pathology/imaging request — module 5's "S5". Requires a confirmed extraction. */
  @Post(':id/pathology-requests')
  @UseGuards(BearerAuthGuard)
  async requestPathology(@Param('id') id: string, @Body() dto: PathologyRequestDto, @Req() req: AuthenticatedRequest) {
    this.requireSpecialistOrStaff(req, 'request pathology/imaging');
    return this.cases.requestPathology(id, dto, this.actorFrom(req));
  }

  @Get(':id/pathology-requests')
  @UseGuards(BearerAuthGuard)
  async pathologyRequests(@Param('id') id: string) {
    return this.cases.listPathologyRequests(id);
  }

  @Post(':id/complete')
  @UseGuards(BearerAuthGuard)
  async complete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    this.requireSpecialistOrStaff(req, 'complete a case');
    return this.cases.completeCase(id, this.actorFrom(req), this.bearerToken(req));
  }

  @Post(':id/cancel')
  @UseGuards(BearerAuthGuard)
  async cancel(@Param('id') id: string, @Body() dto: CancelCaseDto, @Req() req: AuthenticatedRequest) {
    const principal = this.principal(req);
    if (!['patient', 'carer', 'gp', 'specialist', 'internal_staff'].includes(principal.principalType)) {
      throw new ForbiddenException('Not permitted to cancel this case');
    }
    return this.cases.cancelCase(id, dto.reason, this.actorFrom(req));
  }
}
