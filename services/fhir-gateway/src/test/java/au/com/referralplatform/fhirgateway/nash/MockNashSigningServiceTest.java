package au.com.referralplatform.fhirgateway.nash;

import au.com.referralplatform.fhirgateway.nash.dto.NashSignature;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MockNashSigningServiceTest {

  @Test
  void blockModeIsTheDefaultAndAlwaysBlocksSigning() {
    MockNashSigningService service = new MockNashSigningService("block");

    assertThatThrownBy(() -> service.sign("some content".getBytes(StandardCharsets.UTF_8), "8003614900023456"))
        .isInstanceOf(NashSigningUnavailableException.class);
  }

  @Test
  void blockModeAlwaysBlocksVerification() {
    MockNashSigningService service = new MockNashSigningService("block");

    assertThatThrownBy(() -> service.verify("some content".getBytes(StandardCharsets.UTF_8), "not-a-real-signature"))
        .isInstanceOf(NashSigningUnavailableException.class);
  }

  @Test
  void fixtureModeSignsAndVerifiesRoundTripButIsClearlyTagged() throws Exception {
    MockNashSigningService service = new MockNashSigningService("fixture");
    service.init();
    byte[] content = "a referral document".getBytes(StandardCharsets.UTF_8);

    NashSignature signature = service.sign(content, "8003614900023456");

    assertThat(signature.algorithm()).contains("TEST-FIXTURE-NOT-NASH");
    assertThat(service.verify(content, signature.signatureBase64())).isTrue();
  }

  @Test
  void fixtureModeVerificationFailsForTamperedContent() throws Exception {
    MockNashSigningService service = new MockNashSigningService("fixture");
    service.init();
    byte[] original = "a referral document".getBytes(StandardCharsets.UTF_8);
    byte[] tampered = "a tampered referral document".getBytes(StandardCharsets.UTF_8);

    NashSignature signature = service.sign(original, "8003614900023456");

    assertThat(service.verify(tampered, signature.signatureBase64())).isFalse();
  }
}
