package au.com.referralplatform.fhirgateway.export.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Mirrors {@code Referral} in packages/shared-types/src/referral.ts. Mapped
 * to a FHIR {@code ServiceRequest} — the standard FHIR resource for a
 * clinical request/order, used here to represent a GP-to-specialist
 * referral. The gp/specialist HPI-I and display name fields are supplied by
 * the caller (this gateway has no GP/specialist directory of its own — see
 * the Directory Service, services/directory).
 */
public record ReferralDto(
    @NotBlank String id,
    @NotBlank String status,
    boolean urgent,
    @NotBlank String reasonForReferral,
    @NotBlank String gpId,
    String gpHpiI,
    String gpDisplayName,
    String specialistId,
    String specialistHpiI,
    String specialistDisplayName,
    /** ISO 8601 date-time. */
    @NotBlank String createdAt) {}
