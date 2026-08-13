package au.com.referralplatform.fhirgateway.export;

import au.com.referralplatform.fhirgateway.export.dto.AuditSummaryEntryDto;
import au.com.referralplatform.fhirgateway.export.dto.FollowUpPlanDto;
import au.com.referralplatform.fhirgateway.export.dto.PatientDto;
import au.com.referralplatform.fhirgateway.export.dto.PatientSummaryExportRequest;
import au.com.referralplatform.fhirgateway.export.dto.ReferralDto;
import org.hl7.fhir.r4.model.AuditEvent;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.CarePlan;
import org.hl7.fhir.r4.model.CodeableConcept;
import org.hl7.fhir.r4.model.Coding;
import org.hl7.fhir.r4.model.ContactPoint;
import org.hl7.fhir.r4.model.DateTimeType;
import org.hl7.fhir.r4.model.DateType;
import org.hl7.fhir.r4.model.Identifier;
import org.hl7.fhir.r4.model.InstantType;
import org.hl7.fhir.r4.model.Patient;
import org.hl7.fhir.r4.model.Reference;
import org.hl7.fhir.r4.model.ServiceRequest;
import org.hl7.fhir.r4.model.StringType;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.List;
import java.util.UUID;

/**
 * Maps this platform's domain objects (Patient/Referral/FollowUpPlan/audit
 * summary — mirrored from packages/shared-types) onto real FHIR R4
 * resources, per the AU Core-aligned profiles registered in
 * {@link au.com.referralplatform.fhirgateway.validation.AuCoreProfileValidationService}.
 */
@Service
public class FhirExportMappingService {

  public static final String AU_CORE_PATIENT_PROFILE =
      "http://hl7.org.au/fhir/core/StructureDefinition/au-core-patient";
  public static final String AU_CORE_SERVICEREQUEST_PROFILE =
      "http://hl7.org.au/fhir/core/StructureDefinition/au-core-servicerequest";

  private static final String IHI_SYSTEM = "http://ns.electronichealth.net.au/id/hi/ihi/1.0";
  private static final String HPII_SYSTEM = "http://ns.electronichealth.net.au/id/hi/hpii/1.0";
  private static final String REFERRALPLATFORM_PATIENT_ID_SYSTEM = "https://referralplatform.com.au/fhir/patient-id";
  private static final String REFERRALPLATFORM_AUDIT_TYPE_SYSTEM = "https://referralplatform.com.au/fhir/audit-event-type";
  private static final String IMMUDB_TX_ID_EXTENSION = "https://referralplatform.com.au/fhir/StructureDefinition/immudb-tx-id";

  public Bundle buildExportBundle(PatientSummaryExportRequest request) {
    Patient patient = mapPatient(request.patient());

    Bundle bundle = new Bundle();
    bundle.setId(UUID.randomUUID().toString());
    bundle.setType(Bundle.BundleType.COLLECTION);
    bundle.setTimestampElement(new InstantType(new Date()));
    bundle.setIdentifier(new Identifier()
        .setSystem("https://referralplatform.com.au/fhir/export-id")
        .setValue(bundle.getId()));

    addEntry(bundle, "Patient/" + patient.getId(), patient);

    for (ReferralDto referral : request.referrals()) {
      ServiceRequest serviceRequest = mapReferral(referral, request.patient().id());
      addEntry(bundle, "ServiceRequest/" + serviceRequest.getId(), serviceRequest);
    }

    for (FollowUpPlanDto plan : request.followUpPlans()) {
      CarePlan carePlan = mapFollowUpPlan(plan, request.patient().id());
      addEntry(bundle, "CarePlan/" + carePlan.getId(), carePlan);
    }

    for (AuditSummaryEntryDto entry : request.auditSummary()) {
      AuditEvent auditEvent = mapAuditSummaryEntry(entry);
      addEntry(bundle, "AuditEvent/" + auditEvent.getId(), auditEvent);
    }

    return bundle;
  }

  private void addEntry(Bundle bundle, String fullUrl, org.hl7.fhir.r4.model.Resource resource) {
    bundle.addEntry().setFullUrl(fullUrl).setResource(resource);
  }

  public Patient mapPatient(PatientDto dto) {
    Patient patient = new Patient();
    patient.setId(dto.id());
    patient.getMeta().addProfile(AU_CORE_PATIENT_PROFILE);

    if (dto.ihi() != null && !dto.ihi().isBlank()) {
      patient.addIdentifier().setSystem(IHI_SYSTEM).setValue(dto.ihi());
    } else {
      // No verified IHI available for this patient yet — still export a
      // stable platform-scoped identifier so the profile's "at least one
      // identifier" constraint (and, more importantly, real-world record
      // linkage on the receiving end) is satisfied without ever fabricating
      // a fake IHI. See hiservice/ for why IHI lookups fail closed.
      patient.addIdentifier().setSystem(REFERRALPLATFORM_PATIENT_ID_SYSTEM).setValue(dto.id());
    }

    patient.addName().setFamily(dto.familyName()).addGiven(dto.givenName());
    patient.setBirthDateElement(new DateType(dto.dateOfBirth()));

    if (dto.mobileNumber() != null && !dto.mobileNumber().isBlank()) {
      patient.addTelecom()
          .setSystem(ContactPoint.ContactPointSystem.PHONE)
          .setUse(ContactPoint.ContactPointUse.MOBILE)
          .setValue(dto.mobileNumber());
    }
    if (dto.email() != null && !dto.email().isBlank()) {
      patient.addTelecom().setSystem(ContactPoint.ContactPointSystem.EMAIL).setValue(dto.email());
    }

    return patient;
  }

  public ServiceRequest mapReferral(ReferralDto dto, String patientId) {
    ServiceRequest serviceRequest = new ServiceRequest();
    serviceRequest.setId(dto.id());
    serviceRequest.getMeta().addProfile(AU_CORE_SERVICEREQUEST_PROFILE);
    serviceRequest.setStatus(mapReferralStatus(dto.status()));
    serviceRequest.setIntent(ServiceRequest.ServiceRequestIntent.ORDER);
    serviceRequest.setPriority(dto.urgent()
        ? ServiceRequest.ServiceRequestPriority.URGENT
        : ServiceRequest.ServiceRequestPriority.ROUTINE);
    serviceRequest.setCode(new CodeableConcept().setText(dto.reasonForReferral()));
    serviceRequest.setSubject(new Reference("Patient/" + patientId));
    serviceRequest.setAuthoredOnElement(new DateTimeType(dto.createdAt()));

    Reference requester = new Reference().setDisplay(dto.gpDisplayName());
    if (dto.gpHpiI() != null && !dto.gpHpiI().isBlank()) {
      requester.setIdentifier(new Identifier().setSystem(HPII_SYSTEM).setValue(dto.gpHpiI()));
    }
    serviceRequest.setRequester(requester);

    if (dto.specialistId() != null && !dto.specialistId().isBlank()) {
      Reference performer = new Reference().setDisplay(dto.specialistDisplayName());
      if (dto.specialistHpiI() != null && !dto.specialistHpiI().isBlank()) {
        performer.setIdentifier(new Identifier().setSystem(HPII_SYSTEM).setValue(dto.specialistHpiI()));
      }
      serviceRequest.addPerformer(performer);
    }

    return serviceRequest;
  }

  public CarePlan mapFollowUpPlan(FollowUpPlanDto dto, String patientId) {
    CarePlan carePlan = new CarePlan();
    carePlan.setId(dto.id());
    carePlan.setStatus(mapFollowUpPlanStatus(dto.status()));
    carePlan.setIntent(CarePlan.CarePlanIntent.PLAN);
    carePlan.setTitle("Follow-up Plan");
    carePlan.setSubject(new Reference("Patient/" + patientId));
    carePlan.addBasedOn(new Reference("ServiceRequest/" + dto.referralId()));
    carePlan.getPeriod().setEndElement(new DateTimeType(dto.nextReviewDueAt()));

    List<String> tests = dto.requiredTests();
    if (tests != null) {
      for (String test : tests) {
        CarePlan.CarePlanActivityComponent activity = carePlan.addActivity();
        activity.getDetail().setDescription(test);
        activity.getDetail().setStatus("completed".equals(dto.status())
            ? CarePlan.CarePlanActivityStatus.COMPLETED
            : CarePlan.CarePlanActivityStatus.NOTSTARTED);
      }
    }

    if (dto.testCompletionDetectedVia() != null) {
      carePlan.addNote().setText("Test completion detected via: " + dto.testCompletionDetectedVia()
          + (dto.testCompletedAt() != null ? " at " + dto.testCompletedAt() : ""));
    }

    return carePlan;
  }

  public AuditEvent mapAuditSummaryEntry(AuditSummaryEntryDto dto) {
    AuditEvent auditEvent = new AuditEvent();
    auditEvent.setId(dto.id());
    auditEvent.setType(new Coding().setSystem(REFERRALPLATFORM_AUDIT_TYPE_SYSTEM).setCode(dto.type()));
    auditEvent.setRecordedElement(new InstantType(dto.occurredAt()));
    auditEvent.setOutcome(AuditEvent.AuditEventOutcome._0);

    AuditEvent.AuditEventAgentComponent agent = auditEvent.addAgent();
    Reference who = new Reference().setDisplay(
        dto.actorDisplayName() != null ? dto.actorDisplayName() : dto.actorPrincipalType());
    if (dto.actorId() != null) {
      who.setIdentifier(new Identifier().setValue(dto.actorId()).setSystem(
          "https://referralplatform.com.au/fhir/actor-id/" + dto.actorPrincipalType()));
    }
    agent.setWho(who);
    agent.setRequestor(true);

    auditEvent.addEntity(new AuditEvent.AuditEventEntityComponent()
        .setWhat(new Reference(dto.subjectType() + "/" + dto.subjectId())));

    if (dto.immudbTxId() != null && !dto.immudbTxId().isBlank()) {
      auditEvent.addExtension(IMMUDB_TX_ID_EXTENSION, new StringType(dto.immudbTxId()));
    }

    return auditEvent;
  }

  private ServiceRequest.ServiceRequestStatus mapReferralStatus(String status) {
    return switch (status) {
      case "queued" -> ServiceRequest.ServiceRequestStatus.DRAFT;
      case "routed", "booked", "in_review" -> ServiceRequest.ServiceRequestStatus.ACTIVE;
      case "resolved_econsult", "completed" -> ServiceRequest.ServiceRequestStatus.COMPLETED;
      case "lapsed", "declined", "cancelled" -> ServiceRequest.ServiceRequestStatus.REVOKED;
      default -> ServiceRequest.ServiceRequestStatus.UNKNOWN;
    };
  }

  private CarePlan.CarePlanStatus mapFollowUpPlanStatus(String status) {
    return switch (status) {
      case "active" -> CarePlan.CarePlanStatus.ACTIVE;
      case "completed" -> CarePlan.CarePlanStatus.COMPLETED;
      case "suppressed_deceased", "superseded_by_new_referral" -> CarePlan.CarePlanStatus.REVOKED;
      default -> CarePlan.CarePlanStatus.UNKNOWN;
    };
  }
}
