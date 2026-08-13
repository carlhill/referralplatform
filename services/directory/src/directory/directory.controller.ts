import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { DirectoryService } from './directory.service';
import { NhsdSyncService } from './nhsd-sync/nhsd-sync.service';
import { RegisterProfileDto } from './dto/register-profile.dto';
import { SearchDirectoryQueryDto } from './dto/search-directory.query.dto';
import { SuggestPathwayQueryDto } from './dto/suggest-pathway.query.dto';
import { BearerAuthGuard } from '../common/bearer-auth.guard';

/**
 * Directory Service HTTP API — module 7 of modules-and-requirements.md. See
 * BUILD_LOG/directory.md for the full endpoint list and design rationale.
 */
@Controller('directory')
export class DirectoryController {
  constructor(
    private readonly directory: DirectoryService,
    private readonly nhsdSync: NhsdSyncService,
  ) {}

  /**
   * Directory search — deliberately unauthenticated at this layer (public
   * practice-directory data; see DirectoryService's class doc). Called by
   * the Referral Service, Booking Service, and GP/specialist portals.
   */
  @Get('entries')
  async search(@Query() query: SearchDirectoryQueryDto) {
    return this.directory.search(query);
  }

  @Get('entries/:id')
  async getById(@Param('id') id: string) {
    return this.directory.getById(id);
  }

  /**
   * Self-registered profile create/update. Gated by bearer auth — a real
   * deployment would additionally restrict this to `principalType ===
   * 'specialist'` matching the token's own `hpiI` (or `internal_staff`
   * acting on their behalf); left as a documented follow-up since
   * `AuthenticatedPrincipal` doesn't carry an `hpiI` claim yet (see
   * BUILD_LOG/directory.md).
   */
  @Put('entries/self')
  @UseGuards(BearerAuthGuard)
  async registerSelf(@Body() dto: RegisterProfileDto) {
    return this.directory.registerSelfProfile(dto);
  }

  /** HealthPathways Pathway Link API integration — "suggest the right specialist type." */
  @Get('pathway-suggestion')
  async suggestPathway(@Query() query: SuggestPathwayQueryDto) {
    return this.directory.suggestPathway(query.referralReason, query.phnRegion);
  }

  /** Manually trigger an NHSD sync run — ops/admin use, and the pattern integration tests can drive without waiting for the cron. */
  @Post('sync/trigger')
  @UseGuards(BearerAuthGuard)
  async triggerSync() {
    return this.nhsdSync.runSync();
  }
}
