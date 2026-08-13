import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenProvider } from '@referralplatform/auth-client';

export interface CreateDirectoryProfileInput {
  specialistId: string;
  givenName: string;
  familyName: string;
  specialty?: string;
  hpiI?: string;
  contactEmail: string;
}

export interface CreateDirectoryProfileResult {
  created: boolean;
  directoryProfileId?: string;
  reason?: string;
}

/**
 * Real HTTP client for the Directory Service (see root CONVENTIONS.md §6 —
 * "call the target service's REST API directly ... authenticated via a
 * service-to-service token"). This is a genuine outbound call, not a mock —
 * but as of this build `services/directory` is still scaffold-only (its own
 * BUILD_LOG, if any, will confirm), so it has no `POST /directory-entries`
 * endpoint yet to receive this call. Documented, not faked: this client
 * makes the real HTTP request, and on any failure (connection refused, 404,
 * timeout) returns `{ created: false }` rather than throwing — a specialist
 * onboarding must not hard-fail just because a downstream service hasn't
 * caught up yet. `specialists.service.ts` records the resulting
 * `directoryProfileStatus` as `pending_directory_service` in that case, so
 * an operator/cron can retry once the Directory Service is real. See
 * BUILD_LOG/onboarding-account.md.
 */
@Injectable()
export class DirectoryClient {
  private readonly logger = new Logger(DirectoryClient.name);
  private readonly tokens: ServiceTokenProvider;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: ConfigService,
    @Optional() fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
    this.tokens = new ServiceTokenProvider({
      issuer: config.getOrThrow<string>('KEYCLOAK_ISSUER'),
      clientId: config.getOrThrow<string>('KEYCLOAK_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('KEYCLOAK_CLIENT_SECRET'),
      fetchImpl: this.fetchImpl,
    });
  }

  async createProfile(input: CreateDirectoryProfileInput): Promise<CreateDirectoryProfileResult> {
    const baseUrl = this.config.get<string>('DIRECTORY_SERVICE_URL');
    if (!baseUrl) {
      return { created: false, reason: 'DIRECTORY_SERVICE_URL is not configured' };
    }
    try {
      const token = await this.tokens.getToken();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      let res: Response;
      try {
        res = await this.fetchImpl(`${baseUrl}/directory-entries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            sourceSystem: 'onboarding-account',
            specialistId: input.specialistId,
            givenName: input.givenName,
            familyName: input.familyName,
            specialty: input.specialty,
            hpiI: input.hpiI,
            contactEmail: input.contactEmail,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!res.ok) {
        return { created: false, reason: `Directory Service returned ${res.status}` };
      }
      const body = (await res.json()) as { id?: string };
      return { created: true, directoryProfileId: body.id };
    } catch (err) {
      this.logger.warn(
        `Directory Service unreachable (${(err as Error).message}) — recording specialist as pending_directory_service`,
      );
      return { created: false, reason: (err as Error).message };
    }
  }
}
