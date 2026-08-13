package au.com.referralplatform.fhirgateway.hiservice.dto;

import jakarta.validation.constraints.NotBlank;

/** Demographic search — the real HI Service's B2B "Search for an Individual" operation takes equivalent fields. */
public record IhiLookupRequest(
    @NotBlank String givenName,
    @NotBlank String familyName,
    /** ISO 8601 date, e.g. 2000-01-01. */
    @NotBlank String dateOfBirth,
    String medicareNumber) {}
