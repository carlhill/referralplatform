import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenProvider } from '@referralplatform/auth-client';
import { createServiceTokenProvider } from './clients';

/**
 * Client for the Referral Service's `POST /referrals/:id/book` endpoint —
 * that controller's own doc comment says "Called by the Booking Service
 * once a slot is confirmed" — this is that wiring, from the Booking Service
 * side. Plain REST + a service-to-service token via packages/auth-client,
 * per root CONVENTIONS.md §6 ("call the target service's REST API directly
 * ... not a bespoke packages/*-client unless/until three or more services
 * need it").
 *
 * Best-effort, non-blocking on failure: a booking confirmation is already
 * durably committed (the Slot claim + Booking row + AuditOutbox row all
 * land in one DB transaction — see BookingService.confirmSlot) by the time
 * this is called, so a Referral Service outage must not roll back or lose
 * the booking. Failure here is logged loudly and left for ops/reconciliation
 * rather than failing the confirm request — the alternative (fail-closed,
 * as GpAuthorisationClient does for the authorisation *gate*) is wrong here
 * because this is a downstream notification of an already-true fact, not a
 * gate on whether the booking is allowed to happen.
 */
@Injectable()
export class ReferralClient {
  private readonly logger = new Logger(ReferralClient.name);
  private readonly baseUrl: string;
  private readonly tokens: ServiceTokenProvider;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.get<string>('REFERRAL_SERVICE_URL', 'http://referral:3005');
    this.tokens = createServiceTokenProvider(config);
  }

  /**
   * Best-effort lookup of a referral's `gpId` (and `patientId`) — used by
   * BookingService.cancel() to implement the "Patient AND GP notified"
   * dual-notification requirement (business-process-flow.md module 4).
   * Returns `null` on any failure (Referral Service unreachable, referral
   * not found, etc.) rather than throwing — a notification-completeness
   * gap is a lesser failure than blocking cancellation entirely.
   */
  async getReferral(referralId: string): Promise<{ gpId: string; patientId: string } | null> {
    try {
      const token = await this.tokens.getToken();
      const res = await fetch(`${this.baseUrl}/referrals/${encodeURIComponent(referralId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Referral Service responded ${res.status}`);
      }
      const body = (await res.json()) as { gpId: string; patientId: string };
      return { gpId: body.gpId, patientId: body.patientId };
    } catch (err) {
      this.logger.warn(
        `Could not fetch referral ${referralId} from Referral Service for GP-notification lookup — GP will not be notified for this event`,
        err instanceof Error ? err.stack : String(err),
      );
      return null;
    }
  }

  async markBooked(referralId: string): Promise<void> {
    try {
      const token = await this.tokens.getToken();
      const res = await fetch(`${this.baseUrl}/referrals/${encodeURIComponent(referralId)}/book`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Referral Service responded ${res.status}`);
      }
    } catch (err) {
      this.logger.error(
        `Failed to notify Referral Service that referral ${referralId} was booked — booking is still confirmed here; ` +
          `this needs reconciliation`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
