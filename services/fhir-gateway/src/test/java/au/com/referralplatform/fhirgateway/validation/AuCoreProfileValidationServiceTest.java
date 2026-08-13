package au.com.referralplatform.fhirgateway.validation;

import au.com.referralplatform.fhirgateway.export.FhirExportMappingService;
import au.com.referralplatform.fhirgateway.export.dto.PatientDto;
import au.com.referralplatform.fhirgateway.export.dto.ReferralDto;
import org.hl7.fhir.r4.model.CodeableConcept;
import org.hl7.fhir.r4.model.Patient;
import org.hl7.fhir.r4.model.Reference;
import org.hl7.fhir.r4.model.ServiceRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves a sample referral document actually validates against the AU
 * Core-aligned ServiceRequest profile using HAPI FHIR's real
 * FhirInstanceValidator (see AuCoreProfileValidationService's javadoc for
 * exactly what "AU Core-aligned" means in this build) — the specific
 * requirement called out in this service's build brief.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class AuCoreProfileValidationServiceTest {

  @Autowired
  private AuCoreProfileValidationService validationService;

  @Autowired
  private FhirExportMappingService mappingService;

  @Test
  void validReferralServiceRequestPassesAuCoreAlignedProfile() {
    ReferralDto referral = new ReferralDto(
        "referral-1", "routed", true, "Suspected retinal detachment — urgent ophthalmology review",
        "gp-1", "8003614900023456", "Dr Fixture Test GP",
        "specialist-1", null, "Dr Specialist Example",
        "2026-08-13T09:00:00Z");

    ServiceRequest serviceRequest = mappingService.mapReferral(referral, "patient-1");

    ValidationOutcome outcome = validationService.validate(serviceRequest);

    assertThat(outcome.valid())
        .as("Issues: %s", outcome.issueSummaries())
        .isTrue();
    assertThat(serviceRequest.getMeta().getProfile().get(0).getValue())
        .isEqualTo("http://hl7.org.au/fhir/core/StructureDefinition/au-core-servicerequest");
  }

  @Test
  void referralServiceRequestMissingRequiredFieldsFailsValidation() {
    ServiceRequest serviceRequest = new ServiceRequest();
    serviceRequest.setId("bad-referral");
    serviceRequest.getMeta().addProfile("http://hl7.org.au/fhir/core/StructureDefinition/au-core-servicerequest");
    // Deliberately omit status, intent, code, subject, requester, authoredOn —
    // every field the AU Core-aligned profile requires.

    ValidationOutcome outcome = validationService.validate(serviceRequest);

    assertThat(outcome.valid()).isFalse();
    assertThat(outcome.issueSummaries()).isNotEmpty();
  }

  @Test
  void validPatientPassesAuCoreAlignedProfile() {
    PatientDto patientDto = new PatientDto(
        "patient-1", "8003608833357361", "Jane", "Citizen", "1985-04-12", "0400000000", "jane@example.com");

    Patient patient = mappingService.mapPatient(patientDto);

    ValidationOutcome outcome = validationService.validate(patient);

    assertThat(outcome.valid()).as("Issues: %s", outcome.issueSummaries()).isTrue();
  }

  @Test
  void patientMissingNameFailsValidation() {
    Patient patient = new Patient();
    patient.setId("bad-patient");
    patient.getMeta().addProfile("http://hl7.org.au/fhir/core/StructureDefinition/au-core-patient");
    patient.addIdentifier().setSystem("https://referralplatform.com.au/fhir/patient-id").setValue("patient-1");
    patient.setBirthDateElement(new org.hl7.fhir.r4.model.DateType("1985-04-12"));
    // No name — required by the profile.

    ValidationOutcome outcome = validationService.validate(patient);

    assertThat(outcome.valid()).isFalse();
  }

  /** Sanity check that our mapping doesn't accidentally build a resource with no subject reference. */
  @Test
  void referralWithoutSubjectFailsValidationEvenIfOtherFieldsPresent() {
    ServiceRequest serviceRequest = new ServiceRequest();
    serviceRequest.setId("no-subject");
    serviceRequest.getMeta().addProfile("http://hl7.org.au/fhir/core/StructureDefinition/au-core-servicerequest");
    serviceRequest.setStatus(ServiceRequest.ServiceRequestStatus.ACTIVE);
    serviceRequest.setIntent(ServiceRequest.ServiceRequestIntent.ORDER);
    serviceRequest.setCode(new CodeableConcept().setText("Reason"));
    serviceRequest.setRequester(new Reference().setDisplay("Dr GP"));
    serviceRequest.setAuthoredOnElement(new org.hl7.fhir.r4.model.DateTimeType("2026-08-13T09:00:00Z"));
    // subject deliberately omitted

    ValidationOutcome outcome = validationService.validate(serviceRequest);

    assertThat(outcome.valid()).isFalse();
  }
}
