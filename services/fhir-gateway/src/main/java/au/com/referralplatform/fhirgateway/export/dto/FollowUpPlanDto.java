package au.com.referralplatform.fhirgateway.export.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

/**
 * Mirrors {@code FollowUpPlan} in packages/shared-types/src/followup-plan.ts.
 * Mapped to a FHIR {@code CarePlan} referencing the originating referral's
 * ServiceRequest.
 */
public record FollowUpPlanDto(
    @NotBlank String id,
    @NotBlank String referralId,
    @NotBlank String status,
    /** ISO 8601 date-time. */
    @NotBlank String nextReviewDueAt,
    List<String> requiredTests,
    String testCompletionDetectedVia,
    String testCompletedAt) {}
