import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ReferralServiceSyncResult {
  synced: boolean;
  error?: string;
}

/**
 * Best-effort client for the Referral Service's specialist-gated review
 * transition endpoints (`POST /referrals/:id/review/start`,
 * `/review/resolve-econsult`, `/review/complete` — see
 * services/referral/src/referral/referral.controller.ts).
 *
 * **Why this forwards the caller's own bearer token instead of using a
 * service-to-service token** (unlike services/referral's own
 * GpAuthorisationClient, which is the pattern this was modelled on): those
 * three Referral Service endpoints are gated to `principalType ===
 * 'specialist' || 'internal_staff'` — a client-credentials service token
 * from this service would carry `principalType: 'system'` and be rejected
 * with 403 by Referral Service's own authorisation check. Since every call
 * site in this service already runs behind BearerAuthGuard with the
 * deciding specialist's own token attached to the incoming request, the
 * simplest correct fix — without touching services/referral, which is
 * outside this task's scope — is to forward that same token onward. This is
 * a documented judgment call, not an oversight; the alternative (getting
 * services/referral to accept a system principal for these specific
 * transitions) is a cross-cutting change to a sibling service.
 *
 * **Soft-fail by design**: this service's own `SpecialistDecision`/
 * `ReferralCase` rows are the authoritative record of what happened during
 * review — the Referral Service's mirrored `status` field is a courtesy
 * sync for anything else in the platform that watches referral status
 * directly. A failure here (Referral Service down, referral not in the
 * expected state e.g. not yet `booked`, network error) is logged and
 * recorded on the calling row's `referralServiceSyncStatus`/`Error` fields,
 * never thrown — it must never block a specialist's own review decision
 * from being saved.
 */
@Injectable()
export class ReferralServiceClient {
  private readonly logger = new Logger(ReferralServiceClient.name);
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.get<string>('REFERRAL_SERVICE_URL', 'http://referral:3005');
  }

  async startReview(referralId: string, bearerToken: string): Promise<ReferralServiceSyncResult> {
    return this.post(`/referrals/${encodeURIComponent(referralId)}/review/start`, bearerToken);
  }

  async resolveEconsult(referralId: string, bearerToken: string): Promise<ReferralServiceSyncResult> {
    return this.post(`/referrals/${encodeURIComponent(referralId)}/review/resolve-econsult`, bearerToken);
  }

  async completeReview(referralId: string, bearerToken: string): Promise<ReferralServiceSyncResult> {
    return this.post(`/referrals/${encodeURIComponent(referralId)}/review/complete`, bearerToken);
  }

  private async post(path: string, bearerToken: string): Promise<ReferralServiceSyncResult> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Referral Service responded ${res.status}: ${body}`);
      }
      return { synced: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Best-effort sync to Referral Service ${path} failed (non-blocking): ${message}`);
      return { synced: false, error: message };
    }
  }
}
