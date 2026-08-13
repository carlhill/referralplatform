package au.com.referralplatform.fhirgateway.mhr.dto;

import java.util.List;

public record MhrDocumentBundle(String ihi, List<MhrDocumentSummary> documents) {}
