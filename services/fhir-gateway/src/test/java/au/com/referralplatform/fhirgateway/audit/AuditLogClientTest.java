package au.com.referralplatform.fhirgateway.audit;

import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * Proves {@link AuditLogClient#recordBestEffort} never throws — neither when
 * disabled, nor when the Audit Log Service is unreachable (as it will be
 * outside docker-compose's network, or before the cross-service event-type
 * gap documented in AuditLogClient's javadoc is closed). This is the actual
 * safety property the class exists for: a caller's own request (e.g. the
 * FHIR export) must never fail because audit logging failed.
 */
class AuditLogClientTest {

  @Test
  void recordBestEffortIsANoOpWhenAuditingDisabled() {
    ServiceTokenProvider tokenProvider = new ServiceTokenProvider(
        RestClient.builder(), "http://localhost:1/realms/test", "fhir-gateway-service", "unused");
    AuditLogClient client = new AuditLogClient(RestClient.builder(), tokenProvider, "http://localhost:1", false);

    assertThatCode(() -> client.recordBestEffort(
            "fhir.export.performed",
            new AuditLogClient.ActorRef("system", "fhir-gateway", null, null),
            new AuditLogClient.SubjectRef("Patient", "patient-1"),
            Map.of("test", true)))
        .doesNotThrowAnyException();
  }

  @Test
  void recordBestEffortSwallowsFailureWhenAuditLogServiceUnreachable() {
    // Port 1 is a privileged, essentially never-listening port — this
    // simulates "audit-log unreachable" (or, per the javadoc, "audit-log
    // rejected the event type") without depending on any real network.
    ServiceTokenProvider tokenProvider = new ServiceTokenProvider(
        RestClient.builder(), "http://localhost:1/realms/test", "fhir-gateway-service", "unused");
    AuditLogClient client = new AuditLogClient(RestClient.builder(), tokenProvider, "http://localhost:1", true);

    assertThatCode(() -> client.recordBestEffort(
            "fhir.export.performed",
            new AuditLogClient.ActorRef("system", "fhir-gateway", null, null),
            new AuditLogClient.SubjectRef("Patient", "patient-1"),
            Map.of("test", true)))
        .doesNotThrowAnyException();
  }
}
