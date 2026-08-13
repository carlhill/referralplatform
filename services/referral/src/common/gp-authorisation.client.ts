import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenProvider } from '@referralplatform/auth-client';
import { createServiceTokenProvider } from './clients';

export interface GpAuthorisationResult {
  authorised: boolean;
  status: string;
  linkId?: string;
}

/**
 * Client for the GP Authorisation Service's `GET /gp-links/authorisation`
 * endpoint — the real, already-built enforcement point BUILD_LOG/gp-authorisation.md
 * explicitly flags as not yet called from here: "The Referral Service
 * doesn't yet call GET /gp-links/authorisation — whoever builds
 * services/referral's referral-creation flow needs to actually call it (and
 * handle authorised: false by blocking creation)." This is that wiring.
 *
 * Plain REST + a service-to-service token via packages/auth-client, per root
 * CONVENTIONS.md §6 ("call the target service's REST API directly ... not a
 * bespoke packages/*-client unless/until three or more services need it").
 *
 * KNOWN GAP: `docker-compose.yml`'s `referral:` service block doesn't yet
 * set `GP_AUTHORISATION_SERVICE_URL` — out of this task's scope to edit that
 * file directly (root-level, not under services/referral). Falls back to
 * `http://gp-authorisation:3003` (the docker-compose network hostname/port
 * per that file's own `gp-authorisation:` block) if unset, so it still works
 * once that line is added.
 */
@Injectable()
export class GpAuthorisationClient {
  private readonly logger = new Logger(GpAuthorisationClient.name);
  private readonly baseUrl: string;
  private readonly tokens: ServiceTokenProvider;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.get<string>('GP_AUTHORISATION_SERVICE_URL', 'http://gp-authorisation:3003');
    this.tokens = createServiceTokenProvider(config);
  }

  /**
   * Returns the authorisation decision, or `{ authorised: true, status:
   * 'authorisation_check_unavailable' }` (fail *open* logged loudly) only
   * when explicitly configured to via `GP_AUTHORISATION_FAIL_OPEN=true` —
   * default is fail CLOSED (block referral creation) if the GP Authorisation
   * Service can't be reached, since silently allowing an unauthorised GP to
   * create a referral is the worse failure mode for a consent-relevant gate.
   */
  async checkAuthorisation(patientId: string, gpId: string): Promise<GpAuthorisationResult> {
    const failOpen = this.config.get<string>('GP_AUTHORISATION_FAIL_OPEN', 'false') === 'true';
    try {
      const token = await this.tokens.getToken();
      const url = `${this.baseUrl}/gp-links/authorisation?patientId=${encodeURIComponent(patientId)}&gpId=${encodeURIComponent(gpId)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        throw new Error(`GP Authorisation Service responded ${res.status}`);
      }
      return (await res.json()) as GpAuthorisationResult;
    } catch (err) {
      this.logger.error(
        `Could not reach GP Authorisation Service to check patient=${patientId} gp=${gpId} authorisation` +
          (failOpen
            ? ' — GP_AUTHORISATION_FAIL_OPEN=true, allowing'
            : ' — failing closed (blocking referral creation)'),
        err instanceof Error ? err.stack : String(err),
      );
      if (failOpen) {
        return { authorised: true, status: 'authorisation_check_unavailable' };
      }
      return { authorised: false, status: 'authorisation_check_unavailable' };
    }
  }
}
