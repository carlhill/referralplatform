package au.com.referralplatform.fhirgateway.nash.dto;

public record NashSignature(String signatureBase64, String signerHealthcareIdentifier, String algorithm, String signedAt) {}
