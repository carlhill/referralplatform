package au.com.referralplatform.fhirgateway.validation;

import ca.uhn.fhir.context.FhirContext;
import ca.uhn.fhir.parser.IParser;
import ca.uhn.fhir.validation.FhirValidator;
import ca.uhn.fhir.validation.ResultSeverityEnum;
import ca.uhn.fhir.validation.SingleValidationMessage;
import ca.uhn.fhir.validation.ValidationResult;
import jakarta.annotation.PostConstruct;
import ca.uhn.fhir.context.support.DefaultProfileValidationSupport;
import org.hl7.fhir.common.hapi.validation.support.CachingValidationSupport;
import org.hl7.fhir.common.hapi.validation.support.CommonCodeSystemsTerminologyService;
import org.hl7.fhir.common.hapi.validation.support.InMemoryTerminologyServerValidationSupport;
import org.hl7.fhir.common.hapi.validation.support.PrePopulatedValidationSupport;
import org.hl7.fhir.common.hapi.validation.support.ValidationSupportChain;
import org.hl7.fhir.common.hapi.validation.validator.FhirInstanceValidator;
import org.hl7.fhir.instance.model.api.IBaseResource;
import org.hl7.fhir.r4.model.OperationOutcome;
import org.hl7.fhir.r4.model.StructureDefinition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Genuine FHIR AU Core-aligned profile validation, built on HAPI FHIR's real
 * validation engine (FhirInstanceValidator) — not mocked, per this service's
 * build brief. See BUILD_LOG/fhir-gateway.md, "Judgment call — AU Core
 * profile source" for exactly what is and isn't real here: the *validation
 * engine* and the *mechanism* (profile-driven HAPI FHIR instance validation
 * against canonical URLs a resource declares in `meta.profile`) are real and
 * unmodified HAPI FHIR; the specific StructureDefinition *content* under
 * classpath:au-core/ is a minimal, hand-authored reproduction of the key AU
 * Core cardinality constraints for the profiles this gateway actually emits
 * (Patient, ServiceRequest), registered under the real AU Core canonical
 * URLs, because the official `au.core.r4` FHIR package could not be
 * downloaded from the FHIR package registry in this build's sandboxed
 * network (same constraint noted in this service's own README/pom.xml for
 * `mvn clean verify` against Maven Central). Swap the files under
 * classpath:au-core/ for the real downloaded IG package's StructureDefinition
 * resources to move from "AU Core-aligned" to "AU Core-conformant".
 */
@Service
public class AuCoreProfileValidationService {

  private static final Logger log = LoggerFactory.getLogger(AuCoreProfileValidationService.class);

  private final FhirContext fhirContext;
  private FhirValidator validator;

  public AuCoreProfileValidationService(FhirContext fhirContext) {
    this.fhirContext = fhirContext;
  }

  @PostConstruct
  void init() throws IOException {
    PrePopulatedValidationSupport prePopulated = new PrePopulatedValidationSupport(fhirContext);
    IParser jsonParser = fhirContext.newJsonParser();

    PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
    Resource[] profileResources = resolver.getResources("classpath:au-core/*.json");
    for (Resource resource : profileResources) {
      try (InputStream in = resource.getInputStream()) {
        String json = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        StructureDefinition sd = jsonParser.parseResource(StructureDefinition.class, json);
        prePopulated.addStructureDefinition(sd);
        log.info("Loaded AU Core-aligned profile {} from {}", sd.getUrl(), resource.getFilename());
      }
    }

    ValidationSupportChain supportChain = new ValidationSupportChain(
        prePopulated,
        new DefaultProfileValidationSupport(fhirContext),
        new InMemoryTerminologyServerValidationSupport(fhirContext),
        new CommonCodeSystemsTerminologyService(fhirContext));
    CachingValidationSupport cachingChain = new CachingValidationSupport(supportChain);

    FhirInstanceValidator instanceValidator = new FhirInstanceValidator(cachingChain);
    // Our minimal profiles deliberately don't declare terminology bindings or
    // extension definitions — don't fail validation on those, only on the
    // structural/cardinality constraints we actually wrote.
    instanceValidator.setAnyExtensionsAllowed(true);
    instanceValidator.setErrorForUnknownProfiles(false);

    this.validator = fhirContext.newValidator().registerValidatorModule(instanceValidator);
  }

  /** Validates a resource (typically a Bundle) against any AU Core-aligned profile it declares via meta.profile. */
  public ValidationOutcome validate(IBaseResource resource) {
    ValidationResult result = validator.validateWithResult(resource);
    List<String> issueSummaries = new ArrayList<>();
    boolean hasBlockingIssue = false;
    for (SingleValidationMessage message : result.getMessages()) {
      boolean blocking = message.getSeverity() == ResultSeverityEnum.ERROR || message.getSeverity() == ResultSeverityEnum.FATAL;
      hasBlockingIssue = hasBlockingIssue || blocking;
      issueSummaries.add(String.format(
          "[%s] %s: %s", message.getSeverity(), message.getLocationString(), message.getMessage()));
    }
    OperationOutcome operationOutcome = (OperationOutcome) result.toOperationOutcome();
    return new ValidationOutcome(!hasBlockingIssue, operationOutcome, issueSummaries);
  }
}
