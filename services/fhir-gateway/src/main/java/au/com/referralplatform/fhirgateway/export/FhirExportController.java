package au.com.referralplatform.fhirgateway.export;

import au.com.referralplatform.fhirgateway.audit.AuditLogClient;
import au.com.referralplatform.fhirgateway.export.dto.PatientSummaryExportRequest;
import au.com.referralplatform.fhirgateway.validation.AuCoreProfileValidationService;
import au.com.referralplatform.fhirgateway.validation.ValidationOutcome;
import ca.uhn.fhir.context.FhirContext;
import ca.uhn.fhir.parser.IParser;
import jakarta.validation.Valid;
import org.hl7.fhir.r4.model.Bundle;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * The structured FHIR export endpoint — a business continuity requirement
 * per claude/complaints-continuity-deceased.md section 2: what only lives on
 * ReferralPlatform (the Follow-up Plan/recall schedule, the audit log, and
 * any referral still in the pre-routing queue) needs a structured,
 * FHIR-formatted export capability so it's actually usable by another
 * system if this platform can't continue, and so a GP practice or
 * specialist can pull their own records independent of any continuity
 * event.
 *
 * <p>This gateway has no database of its own (root CONVENTIONS.md §5) —
 * the caller (e.g. the Admin/Ops Console acting on a continuity/export
 * request, or a service assembling a patient's own data-portability export)
 * supplies the already-fetched patient/referral/follow-up-plan/audit-summary
 * data; this endpoint's job is the FHIR transformation and AU Core-aligned
 * profile validation, which is genuinely this service's reason to exist.
 */
@RestController
public class FhirExportController {

  private static final Logger log = LoggerFactory.getLogger(FhirExportController.class);
  private static final MediaType FHIR_JSON = MediaType.valueOf("application/fhir+json");

  private final FhirExportMappingService mappingService;
  private final AuCoreProfileValidationService validationService;
  private final AuditLogClient auditLogClient;
  private final FhirContext fhirContext;

  public FhirExportController(
      FhirExportMappingService mappingService,
      AuCoreProfileValidationService validationService,
      AuditLogClient auditLogClient,
      FhirContext fhirContext) {
    this.mappingService = mappingService;
    this.validationService = validationService;
    this.auditLogClient = auditLogClient;
    this.fhirContext = fhirContext;
  }

  @PostMapping(value = "/fhir/export/patient-summary", produces = "application/fhir+json")
  public ResponseEntity<String> exportPatientSummary(@Valid @RequestBody PatientSummaryExportRequest request) {
    Bundle bundle = mappingService.buildExportBundle(request);

    ValidationOutcome outcome = validationService.validate(bundle);
    IParser parser = fhirContext.newJsonParser().setPrettyPrint(true);

    if (!outcome.valid()) {
      log.warn("FHIR export for patient {} failed AU Core-aligned profile validation: {}",
          request.patient().id(), outcome.issueSummaries());
      String operationOutcomeJson = parser.encodeResourceToString(outcome.operationOutcome());
      return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
          .contentType(FHIR_JSON)
          .body(operationOutcomeJson);
    }

    auditLogClient.recordBestEffort(
        "fhir.export.performed",
        new AuditLogClient.ActorRef("system", "fhir-gateway", null, "FHIR Gateway — structured export"),
        new AuditLogClient.SubjectRef("Patient", request.patient().id()),
        Map.of(
            "referralCount", request.referrals().size(),
            "followUpPlanCount", request.followUpPlans().size(),
            "auditSummaryEntryCount", request.auditSummary().size(),
            "bundleId", bundle.getId()));

    String bundleJson = parser.encodeResourceToString(bundle);
    return ResponseEntity.ok().contentType(FHIR_JSON).body(bundleJson);
  }
}
