import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * The consent page's "linked GPs and practices" list + revoke control
 * (claude/modules-and-requirements.md's Consent & Security requirements,
 * minors-multigp-exception-paths.md section 3: "the existing consent/
 * security page ... becomes the natural home for managing this"). GPLink
 * records themselves are owned and persisted by the GP Authorisation
 * Service (services/gp-authorisation), not this one — per root
 * CONVENTIONS.md §6, a service never reads another service's schema
 * directly, so this is a thin, real HTTP proxy over that service's REST
 * API, forwarding the caller's own bearer token so the downstream service's
 * own auth/step-up checks apply unchanged.
 */
@Injectable()
export class LinkedGpsService {
  constructor(private readonly config: ConfigService) {}

  private baseUrl(): string {
    return this.config.getOrThrow<string>('GP_AUTHORISATION_SERVICE_URL');
  }

  async listForPatient(patientId: string, authorizationHeader: string): Promise<unknown> {
    const res = await fetch(`${this.baseUrl()}/gp-links?patientId=${encodeURIComponent(patientId)}`, {
      headers: { Authorization: authorizationHeader },
    });
    if (!res.ok) {
      throw new BadGatewayException(`GP Authorisation Service returned ${res.status} listing linked GPs`);
    }
    return res.json();
  }

  async revoke(linkId: string, reason: string | undefined, authorizationHeader: string): Promise<unknown> {
    const res = await fetch(`${this.baseUrl()}/gp-links/${encodeURIComponent(linkId)}/revoke`, {
      method: 'POST',
      headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      throw new BadGatewayException(`GP Authorisation Service returned ${res.status} revoking GP link ${linkId}`);
    }
    return res.json();
  }
}
