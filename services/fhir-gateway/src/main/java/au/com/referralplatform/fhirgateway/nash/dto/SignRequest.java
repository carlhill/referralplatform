package au.com.referralplatform.fhirgateway.nash.dto;

import jakarta.validation.constraints.NotBlank;

/** {@code contentBase64} is the canonical document bytes to sign (e.g. a FHIR document, base64-encoded). */
public record SignRequest(@NotBlank String contentBase64, @NotBlank String signerHealthcareIdentifier) {}
