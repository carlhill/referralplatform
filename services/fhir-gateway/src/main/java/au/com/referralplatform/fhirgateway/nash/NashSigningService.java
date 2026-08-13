package au.com.referralplatform.fhirgateway.nash;

import au.com.referralplatform.fhirgateway.nash.dto.NashSignature;

/**
 * NASH (National Authentication Service for Health)-backed digital
 * signing — used to non-repudiably assert authorship of a document (e.g.
 * before uploading to My Health Record, or dispatching via the Secure
 * Messaging Gateway) using an organisation's or individual's NASH PKI
 * certificate. Requires a real HSM-backed NASH certificate provisioned via
 * Services Australia, which does not exist in this build — see
 * {@link MockNashSigningService}.
 */
public interface NashSigningService {

  NashSignature sign(byte[] content, String signerHealthcareIdentifier) throws NashSigningUnavailableException;

  boolean verify(byte[] content, String signatureBase64) throws NashSigningUnavailableException;
}
