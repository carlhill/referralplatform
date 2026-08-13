import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuditClient } from '@referralplatform/audit-client';
import { BearerAuthGuard } from '../common/bearer-auth.guard';
import { requireStaff } from '../common/staff';
import type { AuthenticatedRequest } from '../common/authenticated-request';
import { SubjectQueryDto } from './dto/subject-query.dto';

/**
 * ui-design.md Admin/Ops Console screen 4 — audit-log query tool. A thin
 * wrapper over `@referralplatform/audit-client`'s read-side calls
 * (`listForSubject`/`getEvent`/`verify`) against the real Audit Log
 * Service — this console never talks to immudb or Postgres directly (the
 * Audit Log Service is the only thing that does, per
 * audit-log-architecture-decision.md), and never writes an audit entry of
 * its own through this module (writes go through the outbox pattern in the
 * other modules, per root CONVENTIONS.md §7 — read-only here by design).
 *
 * `revealSensitive` is deliberately NOT exposed on this console yet: the
 * Audit Log Service's own `GET /audit-events/:id?revealSensitive=true`
 * already requires an `internal_staff` bearer token on *its own* side (see
 * services/audit-log/src/audit-events/audit-events.controller.ts), but
 * this service authenticates to it as a *service* principal (via
 * ServiceTokenProvider, root CONVENTIONS.md §8), not by forwarding the
 * staff member's own token — so today `revealSensitive=true` would be
 * evaluated against this service's own client-credentials token, which
 * has no `internal_staff` role and would be rejected regardless of who's
 * actually calling this console. Documented gap (BUILD_LOG/admin-console.md):
 * revealing crypto-shredded fields to staff through this console needs
 * either forwarding the caller's own bearer token (matching the
 * consent-security/onboarding-account proxy pattern used elsewhere in this
 * service) or a dedicated internal-staff-scoped service credential —
 * neither implemented here, so this endpoint set only ever returns the
 * non-sensitive envelope.
 */
@Controller('audit-log-query')
@UseGuards(BearerAuthGuard)
export class AuditLogQueryController {
  constructor(private readonly auditClient: AuditClient) {}

  @Get('by-subject')
  async listForSubject(@Query() query: SubjectQueryDto, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return this.auditClient.listForSubject(query.subjectType, query.subjectId);
  }

  @Get(':id')
  async getById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return this.auditClient.getEvent(id);
  }

  /** Independently verifies an entry's tamper-evidence proof rather than trusting the platform's word for it. */
  @Post(':id/verify')
  async verify(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    requireStaff(req);
    return this.auditClient.verify(id);
  }
}
