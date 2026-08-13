import { ActorRef, AuditEventId, ISODateTimeString } from './common';

/**
 * Versioned audit event type registry — see audit-log-architecture-decision.md
 * section "What still has to be built on top", item 3. This is the actual product
 * of the audit design work, not the immudb storage engine underneath it. Add new
 * event types here (append, don't repurpose an existing type) as new
 * clinical/consent-relevant writes are introduced.
 */
export type AuditEventType =
  | 'account.activation.requested'
  | 'account.activated'
  | 'carer.registered'
  | 'carer.reattested'
  | 'gp.linked'
  | 'gp.link.requested'
  | 'gp.link.declined'
  | 'gp.link.revoked'
  | 'referral.created'
  | 'referral.queued'
  | 'referral.lapsed'
  | 'referral.routed'
  | 'referral.declined'
  | 'referral.cancelled'
  | 'consent.granted'
  | 'consent.revoked'
  | 'booking.confirmed'
  | 'booking.cancelled'
  | 'followup.plan.created'
  | 'followup.plan.completed'
  | 'followup.reminder.suppressed'
  | 'concern.raised'
  | 'concern.resolved'
  | 'patient.deceased.flagged'
  | 'access.request.granted'
  | 'access.request.denied';

/**
 * The event written to the Audit Log Service — see audit-log-architecture-decision.md.
 * `payload` holds the minimum necessary structured data for the event type; sensitive
 * field values within it are expected to already be crypto-shredding-eligible (encrypted
 * with a per-user key) by the time they reach the Audit Log Service, per that doc's
 * "Crypto-shredding integration" section — the Audit Log Service does not decide what's
 * sensitive, the writing service does.
 */
export interface AuditEvent {
  id: AuditEventId;
  type: AuditEventType;
  actor: ActorRef;
  /** The domain entity this event is about, e.g. { type: 'Referral', id: '...' }. */
  subject: { type: string; id: string };
  payload: Record<string, unknown>;
  occurredAt: ISODateTimeString;
  /** Populated by the Audit Log Service after the NASH-signed, immudb-backed write succeeds. */
  immudbTxId?: string;
  nashSignature?: string;
}
