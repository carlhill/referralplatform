package au.com.referralplatform.fhirgateway.audit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.Map;

/**
 * Java equivalent of packages/auth-client's {@code ServiceTokenProvider} —
 * a Keycloak OIDC client-credentials grant, cached until shortly before
 * expiry. Every other service gets this from the shared TS package (root
 * CONVENTIONS.md §8); this service is Java, so it has its own small
 * implementation of the same contract rather than depending on an npm
 * package.
 */
@Component
public class ServiceTokenProvider {

  private static final Logger log = LoggerFactory.getLogger(ServiceTokenProvider.class);

  private final RestClient restClient;
  private final String issuer;
  private final String clientId;
  private final String clientSecret;

  private volatile String cachedToken;
  private volatile Instant cachedTokenExpiresAt = Instant.EPOCH;

  public ServiceTokenProvider(
      RestClient.Builder restClientBuilder,
      @Value("${keycloak.issuer}") String issuer,
      @Value("${keycloak.client-id}") String clientId,
      @Value("${keycloak.client-secret}") String clientSecret) {
    this.restClient = restClientBuilder.build();
    this.issuer = issuer;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /** Returns a cached token if still valid for another 10s, otherwise fetches a new one. */
  public synchronized String getToken() {
    if (cachedToken != null && Instant.now().isBefore(cachedTokenExpiresAt.minusSeconds(10))) {
      return cachedToken;
    }
    MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
    form.add("grant_type", "client_credentials");
    form.add("client_id", clientId);
    form.add("client_secret", clientSecret);

    @SuppressWarnings("unchecked")
    Map<String, Object> response = restClient.post()
        .uri(issuer + "/protocol/openid-connect/token")
        .contentType(org.springframework.http.MediaType.APPLICATION_FORM_URLENCODED)
        .body(form)
        .retrieve()
        .body(Map.class);

    if (response == null || response.get("access_token") == null) {
      throw new IllegalStateException("Keycloak token endpoint returned no access_token");
    }
    cachedToken = (String) response.get("access_token");
    Number expiresIn = (Number) response.getOrDefault("expires_in", 60);
    cachedTokenExpiresAt = Instant.now().plusSeconds(expiresIn.longValue());
    log.debug("Fetched new service-to-service token for client {}, expires in {}s", clientId, expiresIn);
    return cachedToken;
  }
}
