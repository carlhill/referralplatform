import { SERVICE_URLS, requireStack, serviceToken } from '../src/stack';

/**
 * REGRESSION: the audit trail recording nothing (2026-08-17) — four stacked bugs.
 *
 *   1. immudb server/client version gap: every `verifiedSet` failed its Merkle proof.
 *   2. immudb 1.1.0 rejects underscores in database names (`audit_log` → `auditlog`).
 *   3. `verifiedGet` base64-decoded a value the SDK already returns as a UTF-8 string,
 *      so `JSON.parse` threw and a bare `catch {}` reported it as
 *      `immudbProofValid: false` — a decode bug that was indistinguishable from tamper
 *      detection, on the one code path whose entire job is detecting tampering.
 *   4. Event types the producers emit were missing from audit-log's runtime whitelist,
 *      so writes were rejected with 400 and silently dropped or retried to a cap.
 *
 * `audit_event_index` sat at 0 rows through all of it and nothing failed loudly. A
 * write followed by a verify is the only assertion that would have caught any of it.
 */
describe('Audit trail: write, store and cryptographically verify', () => {
  beforeAll(requireStack);

  async function post(path: string, token: string, body?: unknown) {
    return fetch(`${SERVICE_URLS.auditLog}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it('accepts an event, signs it, and anchors it in immudb', async () => {
    const token = await serviceToken('referral-service');
    const res = await post('/audit-events', token, {
      type: 'referral.created',
      actor: { principalType: 'gp', id: 'integration-test-gp' },
      subject: { type: 'referral', id: `integration-${Date.now()}` },
      payload: { note: 'integration test' },
    });

    expect(res.status).toBe(201);
    const event = (await res.json()) as Record<string, any>;

    // A real immudb transaction id proves the write survived proof verification —
    // this is what failed for every write before the version pin.
    expect(event.immudbTxId).toBeTruthy();
    expect(event.nashSignature).toBeTruthy();
    expect(event.id).toBeTruthy();
  });

  it('verifies a stored event as intact — both the immudb proof and the NASH signature', async () => {
    const token = await serviceToken('referral-service');
    const created = (await (
      await post('/audit-events', token, {
        type: 'referral.routed',
        actor: { principalType: 'gp', id: 'integration-test-gp' },
        subject: { type: 'referral', id: `integration-verify-${Date.now()}` },
        payload: { note: 'verify path' },
      })
    ).json()) as Record<string, any>;

    const verified = (await (await post(`/audit-events/${created.id}/verify`, token)).json()) as Record<
      string,
      any
    >;

    // Before the decode fix this returned false for both, on a perfectly intact entry.
    expect(verified.immudbProofValid ?? verified.details?.immudbProofValid).toBe(true);
    expect(verified.nashSignatureValid ?? verified.details?.nashSignatureValid).toBe(true);
    expect(verified.valid).toBe(true);
  });

  it('rejects an event type that is not in the shared union', async () => {
    const token = await serviceToken('referral-service');
    const res = await post('/audit-events', token, {
      type: 'definitely.not.a.real.event.type',
      actor: { principalType: 'gp', id: 'integration-test-gp' },
      subject: { type: 'referral', id: 'integration-bad-type' },
      payload: {},
    });

    // The whitelist is load-bearing: this 400 is the mechanism that silently ate 35
    // legitimate event types when producers drifted ahead of it.
    expect(res.status).toBe(400);
  });

  it('accepts the event types producers actually emit', async () => {
    const token = await serviceToken('referral-service');
    // A sample spanning the three families that were missing from the whitelist.
    for (const type of [
      'account.otp.sent',
      'gp_practice.hpio_verified',
      'identity.passkey.revoked',
    ]) {
      const res = await post('/audit-events', token, {
        type,
        actor: { principalType: 'system', id: 'integration-test' },
        subject: { type: 'Principal', id: `integration-${type}` },
        payload: {},
      });
      expect([201, 200]).toContain(res.status);
    }
  });
});
