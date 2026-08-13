package au.com.referralplatform.fhirgateway;

import ca.uhn.fhir.context.FhirContext;
import ca.uhn.fhir.parser.IParser;
import org.hl7.fhir.r4.model.CapabilityStatement;
import org.hl7.fhir.r4.model.Enumerations;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Minimal proof that the HAPI FHIR dependency is actually wired up (not just
 * declared in pom.xml): builds and serialises a real FHIR R4 CapabilityStatement
 * resource describing this gateway. Real conformance/AU Core profile handling,
 * IHI/HPI-O/HPI-I lookups, NASH signing, and MHR integration land here as this
 * service is built out — see claude/modules-and-requirements.md, service #14.
 *
 * Liveness/readiness for orchestration still comes from Spring Boot Actuator's
 * standard /actuator/health endpoint (see application.yml) — this endpoint is
 * about proving FHIR capability, not process health.
 */
@RestController
public class FhirCapabilityController {

  private final FhirContext fhirContext = FhirContext.forR4();

  @GetMapping(value = "/fhir/metadata", produces = MediaType.APPLICATION_JSON_VALUE)
  public String metadata() {
    CapabilityStatement capabilityStatement = new CapabilityStatement();
    capabilityStatement.setStatus(Enumerations.PublicationStatus.DRAFT);
    capabilityStatement.setKind(CapabilityStatement.CapabilityStatementKind.INSTANCE);
    capabilityStatement.setFhirVersion(Enumerations.FHIRVersion._4_0_1);
    capabilityStatement.setSoftware(
        new CapabilityStatement.CapabilityStatementSoftwareComponent().setName("ReferralPlatform FHIR Gateway"));
    capabilityStatement.setFormat(java.util.List.of("json"));

    IParser parser = fhirContext.newJsonParser().setPrettyPrint(true);
    return parser.encodeResourceToString(capabilityStatement);
  }
}
