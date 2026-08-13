package au.com.referralplatform.fhirgateway.nash.dto;

import jakarta.validation.constraints.NotBlank;

public record VerifyRequest(@NotBlank String contentBase64, @NotBlank String signatureBase64) {}
