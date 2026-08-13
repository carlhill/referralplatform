package au.com.referralplatform.fhirgateway.export.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * Request body for {@code POST /fhir/export/patient-summary} — the
 * structured FHIR export capability required as a business continuity
 * feature by claude/complaints-continuity-deceased.md section 2: "What
 * genuinely only lives on ReferralPlatform ... is the Follow-up Plan and
 * recall schedule, the audit log itself, and any referral still in the
 * pre-routing queue. A structured export capability (FHIR-formatted...)
 * should be built as a platform feature in its own right."
 */
public record PatientSummaryExportRequest(
    @NotNull @Valid PatientDto patient,
    List<@Valid ReferralDto> referrals,
    List<@Valid FollowUpPlanDto> followUpPlans,
    List<@Valid AuditSummaryEntryDto> auditSummary) {

  public List<ReferralDto> referrals() {
    return referrals == null ? List.of() : referrals;
  }

  public List<FollowUpPlanDto> followUpPlans() {
    return followUpPlans == null ? List.of() : followUpPlans;
  }

  public List<AuditSummaryEntryDto> auditSummary() {
    return auditSummary == null ? List.of() : auditSummary;
  }
}
