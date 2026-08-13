package au.com.referralplatform.fhirgateway.mhr;

/**
 * Thrown whenever a My Health Record (MHR) read or write cannot be
 * completed — including, deliberately, when the integration itself is
 * unavailable (the normal case in this build — see
 * {@link MockMyHealthRecordService}). Checked, so a caller must explicitly
 * decide how to handle a blocked MHR operation.
 */
public class MyHealthRecordUnavailableException extends Exception {

  public MyHealthRecordUnavailableException(String message) {
    super(message);
  }
}
