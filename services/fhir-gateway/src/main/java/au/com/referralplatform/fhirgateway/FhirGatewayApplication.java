package au.com.referralplatform.fhirgateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Integration &amp; FHIR Gateway entry point. See root CONVENTIONS.md
 * ("The Java exception") and claude/solution-architecture-tech-stack.md for
 * why this service is Java/Spring Boot/HAPI FHIR rather than NestJS like
 * every other service in services/.
 */
@SpringBootApplication
public class FhirGatewayApplication {
  public static void main(String[] args) {
    SpringApplication.run(FhirGatewayApplication.class, args);
  }
}
