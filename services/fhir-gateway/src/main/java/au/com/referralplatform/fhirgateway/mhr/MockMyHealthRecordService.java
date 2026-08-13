package au.com.referralplatform.fhirgateway.mhr;

import au.com.referralplatform.fhirgateway.mhr.dto.MhrDocumentBundle;
import au.com.referralplatform.fhirgateway.mhr.dto.MhrDocumentSummary;
import au.com.referralplatform.fhirgateway.mhr.dto.MhrUploadRequest;
import au.com.referralplatform.fhirgateway.mhr.dto.MhrUploadResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * MOCK — replace with a real My Health Record (MHR) integration once a
 * NASH-authenticated connection to the MHR National Infrastructure (via a
 * conformant clinical software vendor gateway or a direct B2B connection)
 * is provisioned. Same {@code block}/{@code fixture} mode design as
 * {@link au.com.referralplatform.fhirgateway.hiservice.MockHealthcareIdentifiersService} —
 * see that class's javadoc for the reasoning; {@code block} is the
 * production-safe default (configured via {@code referralplatform.mhr.mode}
 * / {@code MHR_MODE}).
 */
@Service
public class MockMyHealthRecordService implements MyHealthRecordService {

  private static final Logger log = LoggerFactory.getLogger(MockMyHealthRecordService.class);

  private final boolean fixtureMode;

  public MockMyHealthRecordService(@Value("${referralplatform.mhr.mode:block}") String mode) {
    this.fixtureMode = "fixture".equalsIgnoreCase(mode);
    if (fixtureMode) {
      log.warn("MHR mock is running in FIXTURE mode — returns fabricated document data, never real MHR content. "
          + "Never use this mode in a real environment (referralplatform.mhr.mode=block).");
    }
  }

  @Override
  public MhrDocumentBundle readDocuments(String ihi) throws MyHealthRecordUnavailableException {
    if (!fixtureMode) {
      throw blocked("read");
    }
    return new MhrDocumentBundle(ihi, List.of(
        new MhrDocumentSummary(UUID.randomUUID().toString(), "SharedHealthSummary", "Fixture Shared Health Summary",
            Instant.now().toString())));
  }

  @Override
  public MhrUploadResult uploadDocument(MhrUploadRequest request) throws MyHealthRecordUnavailableException {
    if (!fixtureMode) {
      throw blocked("upload");
    }
    return new MhrUploadResult(UUID.randomUUID().toString(), "accepted (fixture)", Instant.now().toString());
  }

  private MyHealthRecordUnavailableException blocked(String operation) {
    return new MyHealthRecordUnavailableException(
        "MOCK — My Health Record is not connected in this environment (no NASH-authenticated MHR National "
            + "Infrastructure connection configured). Blocking the " + operation
            + " rather than proceeding without a real MHR connection.");
  }
}
