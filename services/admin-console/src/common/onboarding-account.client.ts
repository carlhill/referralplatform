import { BadGatewayException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenProvider } from '@referralplatform/auth-client';
import { createServiceTokenProvider } from './clients';

export interface RemoteSpecialist {
  id: string;
  givenName: string;
  familyName: string;
  ahpraNumber: string;
  ahpraVerificationStatus: string;
  specialty?: string | null;
  registrationStatus?: string | null;
  [key: string]: unknown;
}

export interface RemoteGpPractice {
  id: string;
  practiceName: string;
  hpiO: string;
  state: string;
  verificationStatus: string;
  integrationTier: string;
  complianceChecklistAcknowledgedAt?: string | null;
  [key: string]: unknown;
}

/**
 * Client for onboarding-account's real `GET /specialists/:id` and
 * `GET /gp-practices/:id` — used by the AHPRA/WWCC verification queue
 * (to snapshot the current automated verification outcome onto a
 * VerificationCase) and the practice onboarding pipeline (to snapshot
 * HPI-O verification / compliance-checklist status onto a
 * PracticeOnboardingCase). Plain REST + a service-to-service token, per
 * root CONVENTIONS.md §6.
 *
 * KNOWN GAP (see BUILD_LOG/admin-console.md): onboarding-account exposes no
 * `GET /specialists` / `GET /gp-practices` LIST endpoint and no manual
 * "override verification status" endpoint — only single-record lookup by
 * id. Because that's out of this task's scope to add (services/onboarding-
 * account is a different agent's scope), this console cannot itself
 * *discover* which specialists/practices need manual review; staff open a
 * VerificationCase using an id/AHPRA number/HPI-O they already have (from a
 * support ticket, or an ahpra_verification_failed/hpio_verification_failed
 * audit event they were alerted to), and this client snapshots that
 * specific record's live status. A `POST /specialists/:id/manual-override`
 * (or equivalent) endpoint on onboarding-account, called from
 * verification-cases.service.ts's `approve()`, is the natural next step to
 * actually close the loop end-to-end once available — documented there too.
 *
 * `docker-compose.yml`'s `admin-console:` block doesn't yet set
 * `ONBOARDING_ACCOUNT_SERVICE_URL` (root-level file, out of this task's
 * scope) — falls back to the docker-compose network hostname/port from that
 * file's own `onboarding-account:` block, mirroring the identical fallback
 * pattern in services/referral/src/common/gp-authorisation.client.ts.
 */
@Injectable()
export class OnboardingAccountClient {
  private readonly logger = new Logger(OnboardingAccountClient.name);
  private readonly baseUrl: string;
  private readonly tokens: ServiceTokenProvider;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.get<string>('ONBOARDING_ACCOUNT_SERVICE_URL', 'http://onboarding-account:3002');
    this.tokens = createServiceTokenProvider(config);
  }

  async getSpecialist(id: string): Promise<RemoteSpecialist> {
    return this.get<RemoteSpecialist>(`/specialists/${encodeURIComponent(id)}`, 'specialist');
  }

  async getGpPractice(id: string): Promise<RemoteGpPractice> {
    return this.get<RemoteGpPractice>(`/gp-practices/${encodeURIComponent(id)}`, 'GP practice');
  }

  private async get<T>(path: string, noun: string): Promise<T> {
    const token = await this.tokens.getToken();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    } catch (err) {
      this.logger.error(`Could not reach onboarding-account at ${this.baseUrl}${path}`, err instanceof Error ? err.stack : String(err));
      throw new BadGatewayException(`Onboarding & Account Service is unreachable`);
    }
    if (res.status === 404) {
      throw new NotFoundException(`No such ${noun} in onboarding-account`);
    }
    if (!res.ok) {
      throw new BadGatewayException(`Onboarding & Account Service returned ${res.status} fetching ${noun}`);
    }
    return (await res.json()) as T;
  }
}
