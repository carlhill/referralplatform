package au.com.referralplatform.fhirgateway.mhr.dto;

import jakarta.validation.constraints.NotBlank;

/** {@code fhirDocumentBase64} is expected to already be a NASH-signed FHIR document — see nash/. */
public record MhrUploadRequest(
    @NotBlank String ihi,
    @NotBlank String documentType,
    @NotBlank String fhirDocumentBase64) {}
