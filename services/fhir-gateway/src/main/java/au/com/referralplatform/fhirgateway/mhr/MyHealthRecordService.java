package au.com.referralplatform.fhirgateway.mhr;

import au.com.referralplatform.fhirgateway.mhr.dto.MhrDocumentBundle;
import au.com.referralplatform.fhirgateway.mhr.dto.MhrUploadRequest;
import au.com.referralplatform.fhirgateway.mhr.dto.MhrUploadResult;

/**
 * My Health Record (MHR) conformance — reading a patient's existing MHR
 * document index and uploading a new clinical document (e.g. a referral
 * letter). Requires a NASH-authenticated connection to the MHR National
 * Infrastructure, which does not exist in this build — see
 * {@link MockMyHealthRecordService}.
 */
public interface MyHealthRecordService {

  MhrDocumentBundle readDocuments(String ihi) throws MyHealthRecordUnavailableException;

  MhrUploadResult uploadDocument(MhrUploadRequest request) throws MyHealthRecordUnavailableException;
}
