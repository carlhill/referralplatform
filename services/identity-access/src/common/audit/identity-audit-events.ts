/**
 * REMOVED 2026-08-17 — this file used to declare a service-local `IdentityAuditEventType`
 * union plus an `asAuditEventType()` cast, because `packages/shared-types`'
 * `AuditEventType` did not list these event types.
 *
 * That workaround caused real, silent data loss. The Audit Log Service validates
 * `type` against a runtime whitelist derived from the shared union, so every event
 * written through the cast was rejected with 400 — and for services writing directly
 * rather than via the outbox, discarded outright. The comment here even asserted the
 * cast was "safe at runtime because the wire accepts any string", which was simply
 * untrue and went unchecked for months.
 *
 * All 5 of these event types are now real members of the shared union and of
 * audit-log's whitelist, kept in step by a compile-time assertion and a contract test.
 * Emit the literal directly — `type: 'identity.passkey.revoked'` — and add any new
 * event type to `packages/shared-types/src/audit-event.ts` and to
 * `services/audit-log/src/audit-events/dto/create-audit-event.dto.ts`.
 *
 * An ESLint rule now blocks re-introducing a cast to `AuditEventType`.
 */
export {};
