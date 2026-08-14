-- CreateTable
CREATE TABLE "referral_case" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "gpId" TEXT NOT NULL,
    "specialistId" TEXT,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "referralText" TEXT NOT NULL,
    "reasonForReferralHint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,

    CONSTRAINT "referral_case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extraction_result" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "structuredData" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBySpecialistId" TEXT,
    "specialistEdits" JSONB,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "extraction_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialist_decision" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "adviceText" TEXT,
    "notes" TEXT,
    "specialistId" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referralServiceSyncStatus" TEXT NOT NULL DEFAULT 'pending',
    "referralServiceSyncError" TEXT,

    CONSTRAINT "specialist_decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathology_imaging_request" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "testsRequested" TEXT[],
    "clinicalNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "mockProviderReference" TEXT,
    "requestedBySpecialistId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pathology_imaging_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_outbox" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor" JSONB NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "audit_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_case_referralId_key" ON "referral_case"("referralId");

-- CreateIndex
CREATE INDEX "referral_case_patientId_idx" ON "referral_case"("patientId");

-- CreateIndex
CREATE INDEX "referral_case_specialistId_idx" ON "referral_case"("specialistId");

-- CreateIndex
CREATE INDEX "referral_case_status_idx" ON "referral_case"("status");

-- CreateIndex
CREATE INDEX "extraction_result_caseId_idx" ON "extraction_result"("caseId");

-- CreateIndex
CREATE INDEX "specialist_decision_caseId_idx" ON "specialist_decision"("caseId");

-- CreateIndex
CREATE INDEX "pathology_imaging_request_caseId_idx" ON "pathology_imaging_request"("caseId");

-- CreateIndex
CREATE INDEX "audit_outbox_publishedAt_idx" ON "audit_outbox"("publishedAt");

-- AddForeignKey
ALTER TABLE "extraction_result" ADD CONSTRAINT "extraction_result_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "referral_case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specialist_decision" ADD CONSTRAINT "specialist_decision_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "referral_case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pathology_imaging_request" ADD CONSTRAINT "pathology_imaging_request_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "referral_case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
