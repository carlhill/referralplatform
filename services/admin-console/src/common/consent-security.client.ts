import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Deceased-patient access-request review — ui-design.md's "Admin/Ops
 * Console" screen 2. consent-security already owns a complete, real,
 * human-reviewed access-request workflow
 * (services/consent-security/src/deceased/access-requests.*) including its
 * own staff-only guard and step-up-gated approve action — this console does
 * NOT duplicate that logic or its data. It's a thin, real HTTP proxy,
 * forwarding the caller's own bearer token so consent-security's own
 * auth/step-up checks apply unchanged — the identical pattern already used
 * by services/consent-security/src/linked-gps/linked-gps.service.ts for its
 * own proxy over the GP Authorisation Service.
 *
 * `docker-compose.yml`'s `admin-console:` block doesn't yet set
 * `CONSENT_SECURITY_SERVICE_URL` (root-level file, out of this task's
 * scope) — falls back to the docker-compose network hostname/port from that
 * file's own `consent-security:` block.
 */
@Injectable()
export class ConsentSecurityClient {
  constructor(private readonly config: ConfigService) {}

  private baseUrl(): string {
    return this.config.get<string>('CONSENT_SECURITY_SERVICE_URL', 'http://consent-security:3004');
  }

  async listPending(authorizationHeader: string): Promise<unknown> {
    return this.call('GET', '/access-requests/pending', authorizationHeader);
  }

  async getById(id: string, authorizationHeader: string): Promise<unknown> {
    return this.call('GET', `/access-requests/${encodeURIComponent(id)}`, authorizationHeader);
  }

  async listForPatient(patientId: string, authorizationHeader: string): Promise<unknown> {
    return this.call('GET', `/deceased-flags/${encodeURIComponent(patientId)}/access-requests`, authorizationHeader);
  }

  async approve(id: string, decisionNote: string | undefined, authorizationHeader: string): Promise<unknown> {
    return this.call('POST', `/access-requests/${encodeURIComponent(id)}/approve`, authorizationHeader, { decisionNote });
  }

  async deny(id: string, decisionNote: string | undefined, authorizationHeader: string): Promise<unknown> {
    return this.call('POST', `/access-requests/${encodeURIComponent(id)}/deny`, authorizationHeader, { decisionNote });
  }

  private async call(method: string, path: string, authorizationHeader: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl()}${path}`, {
        method,
        headers: { Authorization: authorizationHeader, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new BadGatewayException(
        `Consent & Security Service is unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new BadGatewayException(`Consent & Security Service returned ${res.status} for ${method} ${path}: ${detail}`);
    }
    return res.json();
  }
}
