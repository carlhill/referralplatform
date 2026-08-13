package au.com.referralplatform.fhirgateway.audit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Java equivalent of packages/audit-client's {@code AuditClient.record()} —
 * this service is Java, so (per root CONVENTIONS.md's own carve-out for
 * fhir-gateway not depending on any npm workspace package) it can't import
 * the TS client and instead implements the same wire contract directly
 * against the Audit Log Service's {@code POST /audit-events} (see
 * services/audit-log/src/audit-events/audit-events.controller.ts).
 *
 * <p><b>Deliberately a softer guarantee than the outbox pattern every NestJS
 * service uses</b> (root CONVENTIONS.md §7): this gateway has no Postgres
 * schema of its own to host an outbox table in (see CONVENTIONS.md §5 — it's
 * the one service with no relational store), so a failed write here is
 * logged as a warning rather than retried transactionally. It never blocks
 * the caller's own request — see {@link #recordBestEffort}. Documented as a
 * known gap in BUILD_LOG/fhir-gateway.md rather than silently accepted.
 *
 * <p><b>Known cross-service gap</b> (see BUILD_LOG/fhir-gateway.md): the
 * event type this client sends for a completed export
 * ({@code fhir.export.performed}) is not yet in
 * packages/shared-types/src/audit-event.ts's {@code AuditEventType} union or
 * the audit-log service's matching {@code AUDIT_EVENT_TYPES} runtime list —
 * both are outside this service's scope directory. Until that shared change
 * lands, the Audit Log Service will reject this call with 400, which this
 * client treats as a non-fatal, logged warning, same as any other audit-log
 * outage.
 */
@Component
public class AuditLogClient {

  private static final Logger log = LoggerFactory.getLogger(AuditLogClient.class);

  private final RestClient restClient;
  private final ServiceTokenProvider tokenProvider;
  private final String baseUrl;
  private final boolean enabled;

  public AuditLogClient(
      RestClient.Builder restClientBuilder,
      ServiceTokenProvider tokenProvider,
      @Value("${audit-log.service-url}") String baseUrl,
      @Value("${referralplatform.audit.enabled:true}") boolean enabled) {
    this.restClient = restClientBuilder.build();
    this.tokenProvider = tokenProvider;
    this.baseUrl = baseUrl;
    this.enabled = enabled;
  }

  public record ActorRef(String principalType, String id, String healthcareIdentifier, String displayName) {}

  public record SubjectRef(String type, String id) {}

  /**
   * Attempts to record an audit event. Never throws — a failure (audit-log
   * unreachable, auth failure, or the type-not-yet-registered gap above) is
   * logged and swallowed so the caller's own request (e.g. an FHIR export)
   * still succeeds. This is the one place in this service that deliberately
   * doesn't fail closed, because "the export succeeded but we couldn't log
   * it" is a lesser harm than "block a business-continuity export because
   * the audit trail's own event registry hasn't caught up yet" — contrast
   * with hiservice/mhr/nash, which fail closed by design.
   */
  public void recordBestEffort(String type, ActorRef actor, SubjectRef subject, Map<String, Object> payload) {
    if (!enabled) {
      log.debug("Audit logging disabled (referralplatform.audit.enabled=false) — skipping event {}", type);
      return;
    }
    try {
      String token = tokenProvider.getToken();
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("type", type);
      body.put("actor", Map.of(
          "principalType", actor.principalType(),
          "id", actor.id(),
          "healthcareIdentifier", actor.healthcareIdentifier() == null ? "" : actor.healthcareIdentifier(),
          "displayName", actor.displayName() == null ? "" : actor.displayName()));
      body.put("subject", Map.of("type", subject.type(), "id", subject.id()));
      body.put("payload", payload);
      body.put("occurredAt", Instant.now().toString());

      restClient.post()
          .uri(baseUrl + "/audit-events")
          .header("Authorization", "Bearer " + token)
          .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
          .body(body)
          .retrieve()
          .toBodilessEntity();
      log.debug("Recorded audit event {} for subject {}/{}", type, subject.type(), subject.id());
    } catch (Exception e) {
      log.warn("Audit Log Service write failed for event {} (subject {}/{}) — continuing without blocking "
              + "the caller's request. See BUILD_LOG/fhir-gateway.md, 'Known gaps outside this service's scope'.",
          type, subject.type(), subject.id(), e);
    }
  }
}
