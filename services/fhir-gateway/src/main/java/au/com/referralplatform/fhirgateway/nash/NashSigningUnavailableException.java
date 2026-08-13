package au.com.referralplatform.fhirgateway.nash;

/**
 * Thrown whenever a NASH-backed signing or verification operation cannot be
 * completed — including, deliberately, when no real NASH organisation
 * certificate/HSM is configured (the normal case in this build — see
 * {@link MockNashSigningService}). Checked, so a caller must explicitly
 * decide how to handle a blocked signing operation rather than send an
 * unsigned document as if it had been signed.
 */
public class NashSigningUnavailableException extends Exception {

  public NashSigningUnavailableException(String message) {
    super(message);
  }

  public NashSigningUnavailableException(String message, Throwable cause) {
    super(message, cause);
  }
}
