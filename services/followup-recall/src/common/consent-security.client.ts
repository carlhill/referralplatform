import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenProvider } from '@referralplatform/auth-client';
import { createServiceTokenProvider } from './clients';

export interface PublishedDeceasedEvent {
  id: string;
  type: string;
  patientId: string;
  payload: { flagId?: string; suppress?: string[]; carerDelegateAccessRevoked?: boolean };
  occurredAt: string;
}

/**
 * Client for the Consent & Security Service's cross-service freeze signal —
 * see services/consent-security/src/events (its `GET /events` polling feed)
 * and services/consent-security/src/deceased (its `GET /deceased-flags/:id`
 * live lookup). `BUILD_LOG/consent-security.md`'s "Interim polling pattern"
 * section names this exact service (Follow-up & Recall) as one of the two
 * expected consumers and states plainly that "nothing on the consuming side
 * polls `GET /events` yet" — this is that missing consumer.
 *
 * Root CONVENTIONS.md §6: SQS/SNS is the intended real async transport but
 * isn't wired into the scaffold yet, so this is a plain REST client (a
 * service-to-service token via packages/auth-client), not a queue consumer.
 * Two calls are exposed:
 *   - `listDeceasedFrozenEventsSince` — the bulk feed, polled frequently by
 *     DeceasedEventPollerService to catch a freeze as close to immediately
 *     as this interim polling transport allows, and to flip every
 *     already-scheduled reminder for that patient out of "scheduled" in one
 *     sweep (not just at each reminder's own would-be send time).
 *   - `isPatientDeceased` — a direct, synchronous per-patient check, used
 *     by ReminderDispatchScheduler as a defense-in-depth guard immediately
 *     before actually sending a reminder, so even a poller cycle that
 *     hasn't run yet can't let a reminder reach a deceased patient.
 */
@Injectable()
export class ConsentSecurityClient {
  private readonly logger = new Logger(ConsentSecurityClient.name);
  private readonly baseUrl: string;
  private readonly tokens: ServiceTokenProvider;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.get<string>('CONSENT_SECURITY_SERVICE_URL', 'http://consent-security:3004');
    this.tokens = createServiceTokenProvider(config);
  }

  async listDeceasedFrozenEventsSince(since: Date | undefined): Promise<PublishedDeceasedEvent[]> {
    const token = await this.tokens.getToken();
    const params = new URLSearchParams({ type: 'patient.deceased.frozen' });
    if (since) {
      params.set('since', since.toISOString());
    }
    const res = await fetch(`${this.baseUrl}/events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Consent & Security Service returned ${res.status} listing deceased-freeze events`);
    }
    return (await res.json()) as PublishedDeceasedEvent[];
  }

  /**
   * Direct per-patient live check against `GET /deceased-flags/:patientId`.
   * Returns `false` (not deceased) on a 404 — that endpoint throws
   * `NotFoundException` for a patient with no active flag, which is the
   * expected/common case, not an error. On any other failure this fails
   * OPEN (returns `false`, logged loudly) rather than blocking every
   * reminder send whenever the Consent & Security Service has a blip — the
   * bulk poller (`listDeceasedFrozenEventsSince`, run every few seconds) is
   * the primary suppression mechanism; this is a best-effort last-mile
   * check on top of it, not the only line of defense.
   */
  async isPatientDeceased(patientId: string): Promise<boolean> {
    try {
      const token = await this.tokens.getToken();
      const res = await fetch(`${this.baseUrl}/deceased-flags/${encodeURIComponent(patientId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) {
        return false;
      }
      if (!res.ok) {
        throw new Error(`Consent & Security Service returned ${res.status}`);
      }
      return true;
    } catch (err) {
      this.logger.error(
        `Could not reach Consent & Security Service for last-mile deceased check on patient=${patientId} — failing open for this single check (the bulk poller remains the primary guard)`,
        err instanceof Error ? err.stack : String(err),
      );
      return false;
    }
  }
}
