package au.com.referralplatform.fhirgateway;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FhirGatewayApplicationTests {

  @LocalServerPort
  private int port;

  @Autowired
  private TestRestTemplate restTemplate;

  @Test
  void contextLoads() {
    // Smoke test: the Spring context (including HAPI FHIR context bean) boots cleanly.
  }

  @Test
  void healthEndpointReportsUp() {
    ResponseEntity<String> response = restTemplate.getForEntity("http://localhost:" + port + "/actuator/health", String.class);
    assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
    assertThat(response.getBody()).contains("UP");
  }

  @Test
  void fhirMetadataReturnsCapabilityStatement() {
    ResponseEntity<String> response = restTemplate.getForEntity("http://localhost:" + port + "/fhir/metadata", String.class);
    assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
    assertThat(response.getBody()).contains("CapabilityStatement");
  }
}
