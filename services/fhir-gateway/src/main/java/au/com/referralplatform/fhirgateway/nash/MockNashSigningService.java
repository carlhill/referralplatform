package au.com.referralplatform.fhirgateway.nash;

import au.com.referralplatform.fhirgateway.nash.dto.NashSignature;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.time.Instant;
import java.util.Base64;

/**
 * MOCK — replace with a real NASH-backed signing integration once an
 * HSM-backed NASH organisation certificate (per
 * claude/solution-architecture-tech-stack.md: "NASH signing keys ... must
 * live in an HSM-backed key management service ... not an environment
 * variable, not a database column") is provisioned via Services Australia.
 * There is no safe way to fake a signature that carries real legal
 * non-repudiation weight, so this class is explicit about the distinction:
 *
 * <ul>
 *   <li>{@code block} mode (production-safe default, configured via
 *       {@code referralplatform.nash.mode} / {@code NASH_MODE}): every
 *       sign/verify call throws {@link NashSigningUnavailableException} —
 *       the dependent action (e.g. "sign this referral before MHR upload")
 *       is blocked with a clear error rather than proceeding with a
 *       document that looks signed but isn't.</li>
 *   <li>{@code fixture} mode: signs with a local, ephemeral (regenerated on
 *       every process start — never persisted) Ed25519 test keypair, purely
 *       so downstream code paths that expect *some* signature to exist can
 *       be exercised in local dev/tests. The resulting signature verifies
 *       only against this process's own in-memory key — it is not, and does
 *       not claim to be, a NASH signature, and every signature it produces
 *       is tagged {@code algorithm = "Ed25519-TEST-FIXTURE-NOT-NASH"} so it
 *       can never be mistaken for the real thing downstream.</li>
 * </ul>
 */
@Service
public class MockNashSigningService implements NashSigningService {

  private static final Logger log = LoggerFactory.getLogger(MockNashSigningService.class);
  private static final String TEST_FIXTURE_ALGORITHM_TAG = "Ed25519-TEST-FIXTURE-NOT-NASH";

  private final boolean fixtureMode;
  private KeyPair fixtureKeyPair;

  public MockNashSigningService(@Value("${referralplatform.nash.mode:block}") String mode) {
    this.fixtureMode = "fixture".equalsIgnoreCase(mode);
  }

  @PostConstruct
  void init() throws NoSuchAlgorithmException {
    if (fixtureMode) {
      log.warn("NASH signing mock is running in FIXTURE mode — signs with a local, ephemeral test keypair that "
          + "is NOT a NASH certificate and carries no real non-repudiation weight. Never use this mode in a real "
          + "environment (referralplatform.nash.mode=block).");
      KeyPairGenerator generator = KeyPairGenerator.getInstance("Ed25519");
      this.fixtureKeyPair = generator.generateKeyPair();
    }
  }

  @Override
  public NashSignature sign(byte[] content, String signerHealthcareIdentifier) throws NashSigningUnavailableException {
    if (!fixtureMode) {
      throw blocked("sign");
    }
    try {
      Signature signature = Signature.getInstance("Ed25519");
      signature.initSign(privateKey());
      signature.update(content);
      byte[] signatureBytes = signature.sign();
      return new NashSignature(
          Base64.getEncoder().encodeToString(signatureBytes),
          signerHealthcareIdentifier,
          TEST_FIXTURE_ALGORITHM_TAG,
          Instant.now().toString());
    } catch (Exception e) {
      throw new NashSigningUnavailableException("Fixture signing failed unexpectedly", e);
    }
  }

  @Override
  public boolean verify(byte[] content, String signatureBase64) throws NashSigningUnavailableException {
    if (!fixtureMode) {
      throw blocked("verify");
    }
    try {
      Signature signature = Signature.getInstance("Ed25519");
      signature.initVerify(publicKey());
      signature.update(content);
      return signature.verify(Base64.getDecoder().decode(signatureBase64));
    } catch (Exception e) {
      throw new NashSigningUnavailableException("Fixture verification failed unexpectedly", e);
    }
  }

  private PrivateKey privateKey() {
    return fixtureKeyPair.getPrivate();
  }

  private PublicKey publicKey() {
    return fixtureKeyPair.getPublic();
  }

  private NashSigningUnavailableException blocked(String operation) {
    return new NashSigningUnavailableException(
        "MOCK — NASH signing is not available in this environment (no HSM-backed NASH organisation certificate "
            + "configured). Blocking the " + operation
            + " operation rather than proceeding without a verified signature.");
  }
}
