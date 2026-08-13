package au.com.referralplatform.fhirgateway.hiservice;

import au.com.referralplatform.fhirgateway.hiservice.dto.HpiIRecord;
import au.com.referralplatform.fhirgateway.hiservice.dto.HpiORecord;
import au.com.referralplatform.fhirgateway.hiservice.dto.IhiLookupRequest;
import au.com.referralplatform.fhirgateway.hiservice.dto.IhiRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Locale;
import java.util.Map;

/**
 * MOCK — replace with a real Healthcare Identifiers Service (HI Service)
 * integration once Services Australia B2B credentials and a NASH
 * organisation certificate are provisioned. The real integration is a
 * SOAP/HL7 V3-based web service (Services Australia's "HI Service B2B Gateway"),
 * authenticated with a NASH PKI certificate over a dedicated network path —
 * nothing about that can be meaningfully faked in a sandbox with no
 * government credentials, so this class does not attempt to.
 *
 * <p><b>Two modes</b> (configured via {@code referralplatform.hi-service.mode}
 * / {@code HI_SERVICE_MODE}, default {@code block}):
 * <ul>
 *   <li>{@code block} (production-safe default): every lookup throws
 *       {@link HealthcareIdentifierLookupException} with reason
 *       {@code SERVICE_NOT_CONNECTED}. This is the fail-safe behaviour
 *       required by modules-and-requirements.md — a caller must never
 *       proceed with a referral/export/whatever as if an identifier had
 *       been verified when it hasn't been.</li>
 *   <li>{@code fixture}: returns a small, obviously-fake, hardcoded set of
 *       records for a couple of known test names, and {@code NOT_FOUND} for
 *       everything else — lets downstream logic (and this service's own
 *       tests) exercise the "found" path deterministically without ever
 *       pretending to be the real government service. See
 *       {@link #FIXTURE_INDIVIDUALS} — every fixture IHI/HPI-O/HPI-I is a
 *       clearly-non-real value in the correct format, never a real
 *       identifier.</li>
 * </ul>
 */
@Service
public class MockHealthcareIdentifiersService implements HealthcareIdentifiersService {

  private static final Logger log = LoggerFactory.getLogger(MockHealthcareIdentifiersService.class);

  /** Fixture-mode-only test data, keyed by "givenname|familyname|dob" (lowercased). Never real identifiers. */
  private static final Map<String, IhiRecord> FIXTURE_INDIVIDUALS = Map.of(
      "jane|citizen|1985-04-12", new IhiRecord("8003608833357361", "verified", "Jane", "Citizen"),
      "john|smith|1970-01-01", new IhiRecord("8003608333457362", "verified", "John", "Smith"));

  private static final Map<String, HpiORecord> FIXTURE_ORGANISATIONS = Map.of(
      "8003629900012345", new HpiORecord("8003629900012345", "Fixture Test Medical Centre", "active"));

  private static final Map<String, HpiIRecord> FIXTURE_PRACTITIONERS = Map.of(
      "8003614900023456", new HpiIRecord("8003614900023456", "Dr Fixture Test GP", "active"));

  private final Mode mode;

  enum Mode { BLOCK, FIXTURE }

  public MockHealthcareIdentifiersService(@Value("${referralplatform.hi-service.mode:block}") String mode) {
    this.mode = "fixture".equalsIgnoreCase(mode) ? Mode.FIXTURE : Mode.BLOCK;
    if (this.mode == Mode.FIXTURE) {
      log.warn("HI Service mock is running in FIXTURE mode — returns hardcoded fake identifiers for a small "
          + "known test set. Never use this mode in a real environment (referralplatform.hi-service.mode=block).");
    }
  }

  @Override
  public IhiRecord lookupIhi(IhiLookupRequest request) throws HealthcareIdentifierLookupException {
    if (mode == Mode.BLOCK) {
      throw notConnected("IHI lookup");
    }
    String key = String.join("|",
        request.givenName().toLowerCase(Locale.ROOT),
        request.familyName().toLowerCase(Locale.ROOT),
        request.dateOfBirth());
    IhiRecord record = FIXTURE_INDIVIDUALS.get(key);
    if (record == null) {
      throw new HealthcareIdentifierLookupException(
          HealthcareIdentifierLookupException.Reason.NOT_FOUND,
          "No IHI found for the supplied demographics (fixture mode — only the built-in fixture set resolves).");
    }
    return record;
  }

  @Override
  public HpiORecord lookupHpiO(String hpiO) throws HealthcareIdentifierLookupException {
    if (mode == Mode.BLOCK) {
      throw notConnected("HPI-O lookup");
    }
    HpiORecord record = FIXTURE_ORGANISATIONS.get(hpiO);
    if (record == null) {
      throw new HealthcareIdentifierLookupException(
          HealthcareIdentifierLookupException.Reason.NOT_FOUND, "No HPI-O found for " + hpiO + " (fixture mode).");
    }
    return record;
  }

  @Override
  public HpiIRecord lookupHpiI(String hpiI) throws HealthcareIdentifierLookupException {
    if (mode == Mode.BLOCK) {
      throw notConnected("HPI-I lookup");
    }
    HpiIRecord record = FIXTURE_PRACTITIONERS.get(hpiI);
    if (record == null) {
      throw new HealthcareIdentifierLookupException(
          HealthcareIdentifierLookupException.Reason.NOT_FOUND, "No HPI-I found for " + hpiI + " (fixture mode).");
    }
    return record;
  }

  private HealthcareIdentifierLookupException notConnected(String operation) {
    return new HealthcareIdentifierLookupException(
        HealthcareIdentifierLookupException.Reason.SERVICE_NOT_CONNECTED,
        "MOCK — the Healthcare Identifiers Service is not connected in this environment (no Services Australia "
            + "B2B/NASH credentials configured). Blocking " + operation
            + " rather than proceeding without a verified identifier.");
  }
}
