package au.com.referralplatform.fhirgateway.common;

import au.com.referralplatform.fhirgateway.hiservice.HealthcareIdentifierLookupException;
import au.com.referralplatform.fhirgateway.mhr.MyHealthRecordUnavailableException;
import au.com.referralplatform.fhirgateway.nash.NashSigningUnavailableException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Translates this gateway's "fail safely, block the dependent action"
 * exceptions (see modules-and-requirements.md) into clear HTTP responses.
 * 424 Failed Dependency is used deliberately over 503 — this isn't "the
 * fhir-gateway itself is down", it's "a specific upstream government
 * integration this operation depends on isn't available/verified", which is
 * exactly what 424 means.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

  @ExceptionHandler(HealthcareIdentifierLookupException.class)
  public ResponseEntity<Map<String, Object>> handleHiServiceException(HealthcareIdentifierLookupException e) {
    HttpStatus status = e.getReason() == HealthcareIdentifierLookupException.Reason.NOT_FOUND
        ? HttpStatus.NOT_FOUND
        : HttpStatus.FAILED_DEPENDENCY;
    return ResponseEntity.status(status).body(errorBody("healthcare_identifier_lookup_failed", e.getReason().name(), e.getMessage()));
  }

  @ExceptionHandler(MyHealthRecordUnavailableException.class)
  public ResponseEntity<Map<String, Object>> handleMhrException(MyHealthRecordUnavailableException e) {
    return ResponseEntity.status(HttpStatus.FAILED_DEPENDENCY)
        .body(errorBody("my_health_record_unavailable", "MHR_NOT_CONNECTED", e.getMessage()));
  }

  @ExceptionHandler(NashSigningUnavailableException.class)
  public ResponseEntity<Map<String, Object>> handleNashException(NashSigningUnavailableException e) {
    return ResponseEntity.status(HttpStatus.FAILED_DEPENDENCY)
        .body(errorBody("nash_signing_unavailable", "NASH_NOT_CONNECTED", e.getMessage()));
  }

  private Map<String, Object> errorBody(String error, String reason, String message) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("error", error);
    body.put("reason", reason);
    body.put("message", message);
    body.put("timestamp", Instant.now().toString());
    return body;
  }
}
