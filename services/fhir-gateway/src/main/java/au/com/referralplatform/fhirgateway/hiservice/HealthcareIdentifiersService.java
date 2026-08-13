package au.com.referralplatform.fhirgateway.hiservice;

import au.com.referralplatform.fhirgateway.hiservice.dto.HpiIRecord;
import au.com.referralplatform.fhirgateway.hiservice.dto.HpiORecord;
import au.com.referralplatform.fhirgateway.hiservice.dto.IhiLookupRequest;
import au.com.referralplatform.fhirgateway.hiservice.dto.IhiRecord;

/**
 * The Healthcare Identifiers Service (HI Service) integration — Services
 * Australia's national registry for IHI (Individual Healthcare Identifier),
 * HPI-O (Healthcare Provider Identifier — Organisation), and HPI-I
 * (Healthcare Provider Identifier — Individual). Requires a real B2B gateway
 * connection authenticated with a NASH certificate, neither of which exist
 * in this build — see {@link MockHealthcareIdentifiersService}.
 *
 * <p>Every method is checked to throw {@link HealthcareIdentifierLookupException}
 * — see that class's javadoc for why this is deliberate, not an oversight.
 */
public interface HealthcareIdentifiersService {

  IhiRecord lookupIhi(IhiLookupRequest request) throws HealthcareIdentifierLookupException;

  HpiORecord lookupHpiO(String hpiO) throws HealthcareIdentifierLookupException;

  HpiIRecord lookupHpiI(String hpiI) throws HealthcareIdentifierLookupException;
}
