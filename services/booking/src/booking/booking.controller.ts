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
import { BookingService } from './booking.service';
import { SlotsService } from './slots.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ConfirmBookingDto } from './dto/confirm-booking.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { ListBookingsQueryDto } from './dto/list-bookings.query.dto';
import { BearerAuthGuard } from '../common/bearer-auth.guard';
import type { AuthenticatedRequest } from '../common/authenticated-request';
import type { TimeOfDayBand } from './slot-matching';

/**
 * Booking Service HTTP API — module #9 of modules-and-requirements.md. See
 * BUILD_LOG/booking.md for the full endpoint list and design rationale.
 */
@Controller('bookings')
export class BookingController {
  constructor(
    private readonly bookings: BookingService,
    private readonly slots: SlotsService,
  ) {}

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

  /** Patient/carer/GP-initiated (or a GP-practice system acting on their behalf) — captures preference and triggers auto-match. */
  @Post()
  @UseGuards(BearerAuthGuard)
  async create(@Body() dto: CreateBookingDto, @Req() req: AuthenticatedRequest) {
    const principal = this.principal(req);
    if (!['patient', 'carer', 'gp', 'system', 'internal_staff'].includes(principal.principalType)) {
      throw new ForbiddenException('Only the patient, their carer/delegate, the referring GP, or internal staff may create a booking');
    }
    return this.bookings.create(dto, this.actorFrom(req));
  }

  @Get()
  @UseGuards(BearerAuthGuard)
  async list(@Query() query: ListBookingsQueryDto) {
    return this.bookings.list(query);
  }

  @Get(':id')
  @UseGuards(BearerAuthGuard)
  async getById(@Param('id') id: string) {
    return this.bookings.getById(id);
  }

  /** Ranked candidate slots for this booking's current preference profile — lets reception/GP "propose specific slots" per specialist-directory-booking.md. */
  @Get(':id/candidate-slots')
  @UseGuards(BearerAuthGuard)
  async candidateSlots(@Param('id') id: string) {
    const booking = await this.bookings.getById(id);
    return this.slots.rankedCandidates(
      booking.specialistId,
      booking.preferredDayOfWeek ?? undefined,
      (booking.preferredTimeOfDay as TimeOfDayBand | null) ?? undefined,
    );
  }

  /** Confirms a specific slot — the concurrency-critical operation (see BookingService.confirmSlot / SlotClaimService.claim). */
  @Post(':id/confirm')
  @UseGuards(BearerAuthGuard)
  async confirm(@Param('id') id: string, @Body() dto: ConfirmBookingDto, @Req() req: AuthenticatedRequest) {
    return this.bookings.confirmSlot(id, dto.slotId, this.actorFrom(req));
  }

  /** Patient/carer/GP/specialist-initiated cancellation — dual notification + slot release + waitlist auto-fill. */
  @Post(':id/cancel')
  @UseGuards(BearerAuthGuard)
  async cancel(@Param('id') id: string, @Body() body: CancelBookingDto, @Req() req: AuthenticatedRequest) {
    const principal = this.principal(req);
    if (!['patient', 'carer', 'gp', 'specialist', 'internal_staff'].includes(principal.principalType)) {
      throw new ForbiddenException('Only the patient, their carer/delegate, the GP, the specialist, or internal staff may cancel a booking');
    }
    return this.bookings.cancel(id, this.actorFrom(req), body.reason);
  }
}
