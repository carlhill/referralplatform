import { Controller, Delete, ForbiddenException, Get, Param, Req, UseGuards } from '@nestjs/common';
import { BearerAuthGuard, type RequestWithAuth } from '../auth/bearer-auth.guard';
import { CryptoShreddingService } from './crypto-shredding.service';

/**
 * The right-to-erasure trigger for this service's crypto-shredding scheme —
 * see claude/audit-log-architecture-decision.md and
 * claude/gdpr-applicability.md. Destroying a user's data key is
 * irreversible and staff-only; it does not delete the immudb entries
 * themselves (that's the point — tamper-evidence is preserved, the
 * *content* becomes permanently unreadable).
 */
@Controller('crypto-keys')
@UseGuards(BearerAuthGuard)
export class CryptoShreddingController {
  constructor(private readonly cryptoShredding: CryptoShreddingService) {}

  @Get(':userId/status')
  async status(@Param('userId') userId: string) {
    return { userId, hasLiveKey: await this.cryptoShredding.hasLiveKey(userId) };
  }

  @Delete(':userId')
  async shred(@Param('userId') userId: string, @Req() req: RequestWithAuth) {
    if (!req.auth?.roles.includes('internal_staff') && req.auth?.principalType !== 'system') {
      throw new ForbiddenException('Only internal staff (or an authorised service) may crypto-shred a user\'s data key');
    }
    await this.cryptoShredding.shredUser(userId);
    return { userId, shredded: true, shreddedAt: new Date().toISOString() };
  }
}
