package au.com.referralplatform.fhirgateway.export.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Mirrors the fields of {@code Patient} in
 * packages/shared-types/src/patient.ts that are relevant to a structured
 * export. This gateway has no Postgres store of its own (see root
 * CONVENTIONS.md §5) — the caller (e.g. admin-console, on a business
 * continuity export request) is expected to have already fetched the
 * patient/referral/follow-up-plan/audit-summary data from the services that
 * own it and pass it here for FHIR transformation + AU Core validation.
 */
public record PatientDto(
    @NotBlank String id,
    /** IHI, if verified — see hiservice/. May be absent for a patient not yet IHI-verified. */
    String ihi,
    @NotBlank String givenName,
    @NotBlank String familyName,
    /** ISO 8601 date, e.g. 2000-01-01. */
    @NotBlank String dateOfBirth,
    String mobileNumber,
    String email) {}
