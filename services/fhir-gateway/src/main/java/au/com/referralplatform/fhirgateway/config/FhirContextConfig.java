package au.com.referralplatform.fhirgateway.config;

import ca.uhn.fhir.context.FhirContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * A single shared {@link FhirContext} for the whole application. FhirContext
 * is explicitly documented by HAPI FHIR as expensive to create (it scans and
 * caches model metadata) and thread-safe — build exactly one and reuse it,
 * rather than one per class as the original scaffold's
 * FhirCapabilityController did.
 */
@Configuration
public class FhirContextConfig {

  @Bean
  public FhirContext fhirContext() {
    return FhirContext.forR4();
  }
}
