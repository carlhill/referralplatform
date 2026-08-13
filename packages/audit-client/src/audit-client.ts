import type { ActorRef, AuditEvent, AuditEventType } from '@referralplatform/shared-types';

export interface AuditClientConfig {
  /** Base URL of the Audit Log Service, e.g. http://audit-log:3012 (see docker-compose.yml). */
  baseUrl: string;
  /**
   * Service-to-service bearer token (a Keycloak client-credentials token — see
   * packages/auth-client). Every write to the Audit Log Service must be
   * authenticated as the calling service, never anonymous.
   */
  getServiceToken: () => Promise<string> | string;
  /** Override for tests; defaults to the global fetch (Node >=18). */
  fetchImpl?: typeof fetch;
  /** Request timeout in ms. Audit writes are on the write-latency budget documented in modules-and-requirements.md. */
  timeoutMs?: number;
}

export interface RecordAuditEventInput {
  type: AuditEventType;
  actor: ActorRef;
  subject: { type: string; id: string };
  payload: Record<string, unknown>;
  /** Defaults to now (server clock) if omitted. */
  occurredAt?: string;
}

export interface VerifyAuditEventResult {
  eventId: string;
  /** True if immudb's cryptographic proof confirms this entry has not been tampered with since it was written. */
  valid: boolean;
  immudbTxId: string;
  verifiedAt: string;
}

export class AuditClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'AuditClientError';
  }
}

/**
 * Thin HTTP client for the Audit Log Service. See root CONVENTIONS.md
 * ("Using packages/audit-client") for the two supported call patterns:
 *
 * 1. **Outbox pattern (recommended for anything clinical/consent-relevant).**
 *    Write your domain row and an `audit_outbox` row in the same DB
 *    transaction; a small relay/worker in your service calls
 *    `auditClient.record()` for each unpublished outbox row. This is what
 *    makes "every clinical/consent write produces a corresponding signed
 *    audit entry" structurally true rather than best-effort, per
 *    audit-log-architecture-decision.md.
 * 2. **Direct call (acceptable for lower-stakes, non-clinical events).**
 *    Call `auditClient.record()` directly in the request path.
 *
 * Every service that performs a clinical or consent-relevant write MUST use
 * pattern 1. See services/audit-log/README.md for the Audit Log Service's own
 * API this client wraps.
 */
export class AuditClient {
  constructor(private readonly config: AuditClientConfig) {}

  async record(input: RecordAuditEventInput): Promise<AuditEvent> {
    return this.request<AuditEvent>('POST', '/audit-events', input);
  }

  async getEvent(id: string): Promise<AuditEvent> {
    return this.request<AuditEvent>('GET', `/audit-events/${encodeURIComponent(id)}`);
  }

  async listForSubject(subjectType: string, subjectId: string): Promise<AuditEvent[]> {
    const qs = new URLSearchParams({ subjectType, subjectId });
    return this.request<AuditEvent[]>('GET', `/audit-events?${qs.toString()}`);
  }

  /** Independently verify an entry's tamper-evidence proof, rather than trusting the platform's word for it. */
  async verify(id: string): Promise<VerifyAuditEventResult> {
    return this.request<VerifyAuditEventResult>('POST', `/audit-events/${encodeURIComponent(id)}/verify`);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const token = await this.config.getServiceToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 5000);
    try {
      const res = await fetchImpl(`${this.config.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => undefined);
        throw new AuditClientError(`Audit Log Service returned ${res.status}`, res.status, text);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
