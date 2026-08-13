export interface SecureMessageSendRequest {
  referralId: string;
  /** Vendor-specific mailbox/endpoint identifier for the recipient (DirectoryEntry.secureMessagingEndpointId). */
  recipientEndpointId: string;
  urgent: boolean;
  /**
   * A routing-envelope summary only (e.g. subspecialty) — the actual
   * referral clinical content is carried by the Referral Service's own
   * document/FHIR payload, never by this gateway's routing envelope. Keeps
   * this service's logs/DB free of clinical content it has no business
   * holding.
   */
  summary: string;
}

export interface SecureMessageSendResult {
  vendorMessageId: string;
  status: 'accepted';
}

/**
 * Vendor-agnostic interface every secure messaging vendor client (and the
 * internal "direct delivery to an onboarded specialist" path) implements —
 * "abstracts vendor-specific protocols behind one internal interface so
 * adding a second secure messaging vendor doesn't touch referral logic,"
 * per modules-and-requirements.md's Secure Messaging Gateway requirement.
 * A failed send MUST throw `SecureMessagingVendorError` (or a subclass) —
 * never resolve with a fabricated "success," per that same requirement's
 * "must not silently fail a routed referral."
 */
export interface SecureMessagingVendorClient {
  readonly vendorName: string;
  send(request: SecureMessageSendRequest): Promise<SecureMessageSendResult>;
}

export const HEALTHLINK_CLIENT = Symbol('HEALTHLINK_CLIENT');
export const MEDICAL_OBJECTS_CLIENT = Symbol('MEDICAL_OBJECTS_CLIENT');
export const DIRECT_DELIVERY_CLIENT = Symbol('DIRECT_DELIVERY_CLIENT');
