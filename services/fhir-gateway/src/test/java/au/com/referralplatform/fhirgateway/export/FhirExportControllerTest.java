package au.com.referralplatform.fhirgateway.export;

import au.com.referralplatform.fhirgateway.export.dto.AuditSummaryEntryDto;
import au.com.referralplatform.fhirgateway.export.dto.FollowUpPlanDto;
import au.com.referralplatform.fhirgateway.export.dto.PatientDto;
import au.com.referralplatform.fhirgateway.export.dto.PatientSummaryExportRequest;
import au.com.referralplatform.fhirgateway.export.dto.ReferralDto;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end proof of the structured FHIR export endpoint required by
 * claude/complaints-continuity-deceased.md section 2 (business continuity):
 * a patient's referral history, Follow-up Plans, and audit-log summary go in
 * as plain domain data and come out as a valid FHIR Bundle that has passed
 * AU Core-aligned profile validation.
 */
// Audit logging disabled for this test: the write to the Audit Log Service is
// deliberately best-effort/non-blocking (see AuditLogClient's javadoc), but
// there's no reason for a unit test to depend on network behaviour (DNS
// resolution of the "audit-log" hostname, which only exists inside
// docker-compose's network) to stay fast and deterministic.
@SpringBootTest(properties = "referralplatform.audit.enabled=false")
@AutoConfigureMockMvc
class FhirExportControllerTest {

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private ObjectMapper objectMapper;

  @Test
  void exportsValidatedFhirBundleForFullPatientSummary() throws Exception {
    PatientSummaryExportRequest request = new PatientSummaryExportRequest(
        new PatientDto("patient-1", "8003608833357361", "Jane", "Citizen", "1985-04-12", "0400000000", "jane@example.com"),
        List.of(new ReferralDto(
            "referral-1", "completed", false, "Chronic knee pain — orthopaedic review",
            "gp-1", "8003614900023456", "Dr Fixture Test GP",
            "specialist-1", null, "Dr Specialist Example",
            "2026-06-01T09:00:00Z")),
        List.of(new FollowUpPlanDto(
            "plan-1", "referral-1", "active", "2026-12-01T09:00:00Z",
            List.of("Repeat X-ray"), null, null)),
        List.of(new AuditSummaryEntryDto(
            "audit-1", "referral.created", "gp", "gp-1", "Dr Fixture Test GP",
            "Referral", "referral-1", "2026-06-01T09:00:00Z", "tx-123")));

    mockMvc.perform(post("/fhir/export/patient-summary")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(request)))
        .andExpect(status().isOk())
        .andExpect(content().contentTypeCompatibleWith("application/fhir+json"))
        .andExpect(jsonPath("$.resourceType").value("Bundle"))
        .andExpect(jsonPath("$.type").value("collection"))
        .andExpect(jsonPath("$.entry[0].resource.resourceType").value("Patient"));
  }

  @Test
  void exportRejectsUnprocessableDataWithOperationOutcome() throws Exception {
    // patient with a blank family name fails bean validation before it ever
    // reaches FHIR mapping/validation — proves the request-level guard works too.
    String invalidJson = """
        {"patient": {"id": "patient-1", "givenName": "Jane", "familyName": "", "dateOfBirth": "1985-04-12"}}
        """;

    mockMvc.perform(post("/fhir/export/patient-summary")
            .contentType(MediaType.APPLICATION_JSON)
            .content(invalidJson))
        .andExpect(status().isBadRequest());
  }
}
