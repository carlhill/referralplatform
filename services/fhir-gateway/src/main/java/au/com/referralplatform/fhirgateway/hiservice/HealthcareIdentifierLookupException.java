package au.com.referralplatform.fhirgateway.hiservice;

/**
 * Thrown whenever a Healthcare Identifiers Service (HI Service) lookup
 * cannot return a verified identifier — including, deliberately, when the
 * integration itself is unavailable. Per modules-and-requirements.md:
 * "IHI/HPI-O/HPI-I lookups must fail safely (block the dependent action
 * with a clear error) rather than silently proceeding without verified
 * identifiers." Checked, on purpose — a caller must explicitly decide how
 * to handle a blocked lookup rather than have it slip through unnoticed.
 */
public class HealthcareIdentifierLookupException extends Exception {

  public enum Reason {
    /** No real HI Service B2B/NASH connection exists in this environment — see MockHealthcareIdentifiersService. */
    SERVICE_NOT_CONNECTED,
    /** The service (real or fixture) was reachable but found no matching record. */
    NOT_FOUND,
    /** More than one plausible match was found — must not guess; needs human resolution. */
    AMBIGUOUS_MATCH
  }

  private final Reason reason;

  public HealthcareIdentifierLookupException(Reason reason, String message) {
    super(message);
    this.reason = reason;
  }

  public Reason getReason() {
    return reason;
  }
}
