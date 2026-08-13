/**
 * Thrown by any `SecureMessagingVendorClient` implementation (or the direct
 * delivery client) when a send genuinely fails — the one and only signal
 * `SecureMessagingService` treats as "delivery failed." Never swallow this
 * into a boolean/undefined return; the whole point of this type existing is
 * that a delivery failure is a typed, catchable event, not a silent
 * no-op — see modules-and-requirements.md's "must not silently fail a
 * routed referral."
 */
export class SecureMessagingVendorError extends Error {
  constructor(
    public readonly vendorName: string,
    message: string,
  ) {
    super(message);
    this.name = 'SecureMessagingVendorError';
  }
}
