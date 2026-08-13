package au.com.referralplatform.fhirgateway.hiservice;

import au.com.referralplatform.fhirgateway.hiservice.dto.IhiLookupRequest;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Proves the fail-safe requirement from modules-and-requirements.md
 * directly: "IHI/HPI-O/HPI-I lookups must fail safely (block the dependent
 * action with a clear error) rather than silently proceeding without
 * verified identifiers" — the production-default (block) mode never returns
 * a value, only a typed exception; fixture mode (dev/test only) is
 * separately proven to actually resolve known fixtures so downstream logic
 * has something real to exercise.
 */
class MockHealthcareIdentifiersServiceTest {

  @Test
  void blockModeIsTheDefaultAndAlwaysBlocksIhiLookup() {
    MockHealthcareIdentifiersService service = new MockHealthcareIdentifiersService("block");

    assertThatThrownBy(() -> service.lookupIhi(new IhiLookupRequest("Jane", "Citizen", "1985-04-12", null)))
        .isInstanceOf(HealthcareIdentifierLookupException.class)
        .satisfies(e -> assertThat(((HealthcareIdentifierLookupException) e).getReason())
            .isEqualTo(HealthcareIdentifierLookupException.Reason.SERVICE_NOT_CONNECTED));
  }

  @Test
  void blockModeAlwaysBlocksHpiOAndHpiILookups() {
    MockHealthcareIdentifiersService service = new MockHealthcareIdentifiersService("block");

    assertThatThrownBy(() -> service.lookupHpiO("8003629900012345"))
        .isInstanceOf(HealthcareIdentifierLookupException.class);
    assertThatThrownBy(() -> service.lookupHpiI("8003614900023456"))
        .isInstanceOf(HealthcareIdentifierLookupException.class);
  }

  @Test
  void fixtureModeResolvesKnownFixtureDemographics() throws HealthcareIdentifierLookupException {
    MockHealthcareIdentifiersService service = new MockHealthcareIdentifiersService("fixture");

    var record = service.lookupIhi(new IhiLookupRequest("Jane", "Citizen", "1985-04-12", null));

    assertThat(record.ihi()).isEqualTo("8003608833357361");
    assertThat(record.status()).isEqualTo("verified");
  }

  @Test
  void fixtureModeStillBlocksUnknownDemographicsAsNotFound() {
    MockHealthcareIdentifiersService service = new MockHealthcareIdentifiersService("fixture");

    assertThatThrownBy(() -> service.lookupIhi(new IhiLookupRequest("Nobody", "Unknown", "1999-09-09", null)))
        .isInstanceOf(HealthcareIdentifierLookupException.class)
        .satisfies(e -> assertThat(((HealthcareIdentifierLookupException) e).getReason())
            .isEqualTo(HealthcareIdentifierLookupException.Reason.NOT_FOUND));
  }
}
