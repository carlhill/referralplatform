package au.com.referralplatform.fhirgateway.export.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Mirrors {@code AuditEvent} in packages/shared-types/src/audit-event.ts —
 * the caller is expected to have already queried the Audit Log Service
 * (packages/audit-client / GET /audit-events) for the entries relevant to
 * this patient and pass a summary here. Mapped to a FHIR base
 * {@code AuditEvent} resource, which exists in the FHIR spec for exactly
 * this purpose. {@code immudbTxId} is carried through as a custom extension
 * so a recipient of the export retains the pointer needed to independently
 * re-verify tamper-evidence against the source Audit Log Service later.
 */
public record AuditSummaryEntryDto(
    @NotBlank String id,
    /** e.g. "referral.created" — see packages/shared-types/src/audit-event.ts AuditEventType. */
    @NotBlank String type,
    @NotBlank String actorPrincipalType,
    String actorId,
    String actorDisplayName,
    @NotBlank String subjectType,
    @NotBlank String subjectId,
    /** ISO 8601 date-time. */
    @NotBlank String occurredAt,
    String immudbTxId) {}
