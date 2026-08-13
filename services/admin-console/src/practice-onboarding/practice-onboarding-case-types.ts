export interface PracticeOnboardingCaseRecord {
  id: string;
  gpPracticeId: string | null;
  practiceName: string;
  hpiO: string | null;
  phn: string | null;
  state: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  stage: string;
  lastKnownVerificationStatus: string | null;
  lastKnownComplianceAckAt: Date | null;
  lastRefreshedAt: Date | null;
  integrationTier: string | null;
  notes: string | null;
  assignedStaffId: string | null;
  createdByStaffId: string;
  createdAt: Date;
  updatedAt: Date;
}
