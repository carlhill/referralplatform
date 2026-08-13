package au.com.referralplatform.fhirgateway.validation;

import org.hl7.fhir.r4.model.OperationOutcome;

import java.util.List;

/**
 * Result of validating a FHIR resource against its declared profile(s).
 * {@code valid} is false if any ERROR or FATAL-severity issue was found
 * (warnings/information don't block). {@code operationOutcome} is the real
 * FHIR OperationOutcome resource HAPI FHIR produced — returned to the caller
 * as-is on failure, per the FHIR spec's own convention for reporting
 * validation problems.
 */
public record ValidationOutcome(boolean valid, OperationOutcome operationOutcome, List<String> issueSummaries) {}
