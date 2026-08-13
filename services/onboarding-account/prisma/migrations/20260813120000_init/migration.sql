-- HAND-WRITTEN — see BUILD_LOG/onboarding-account.md ("Known gaps"). This
-- sandbox's egress policy blocks binaries.prisma.sh, so `prisma migrate dev`
-- could not download the schema-engine binary needed to generate this file
-- for real. It was written by hand to match prisma/schema.prisma exactly,
-- following Prisma's standard generated-migration SQL shape (the same
-- workaround services/identity-access used — see its own BUILD_LOG entry).
-- Verify with `npm run prisma:migrate -w services/onboarding-account -- --name init`
-- once network access to binaries.prisma.sh is available — it should report
-- the schema already in sync, or highlight any diff to fix.

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "ihi" TEXT,
    "givenName" TEXT NOT NULL,
    "familyName" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "mobileNumber" TEXT NOT NULL,
    "email" TEXT,
    "medicareNumber" TEXT,
    "isMinor" BOOLEAN NOT NULL DEFAULT false,
    "guardianCarerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_activation',
    "sensitiveCategoriesHiddenFromDelegates" JSONB NOT NULL DEFAULT '[]',
    "deceasedFlaggedAt" TIMESTAMP(3),
    "deceasedFlaggedByGpId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_activation_requests" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "triggeringGpId" TEXT NOT NULL,
    "triggeringGpHpiO" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "dobSnapshot" DATE NOT NULL,
    "medicareSnapshot" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "role" TEXT,
    "otpDeliveryChannel" TEXT NOT NULL DEFAULT 'email',
    "identityVerifyAttempts" INTEGER NOT NULL DEFAULT 0,
    "identityLockedUntil" TIMESTAMP(3),
    "identityVerifiedAt" TIMESTAMP(3),
    "linkEmail" TEXT NOT NULL,
    "linkSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkExpiresAt" TIMESTAMP(3) NOT NULL,
    "queueExpiresAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_activation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carers" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "activationRequestId" TEXT,
    "givenName" TEXT NOT NULL,
    "familyName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "relationship" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'nominated_delegate',
    "sharesPatientMobileNumber" BOOLEAN NOT NULL,
    "ownMobileNumber" TEXT,
    "authorisedRepresentativeEvidenceDocumentId" TEXT,
    "sensitiveCategoryAccessGrantedAt" TIMESTAMP(3),
    "lastReattestedAt" TIMESTAMP(3),
    "nextReattestationDueAt" TIMESTAMP(3) NOT NULL,
    "suspectedOrganisationalCarer" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "carers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" TEXT NOT NULL,
    "activationRequestId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockedUntil" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gp_practices" (
    "id" TEXT NOT NULL,
    "practiceName" TEXT NOT NULL,
    "hpiO" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL DEFAULT 'pending',
    "integrationTier" TEXT NOT NULL DEFAULT 'A',
    "complianceChecklistAcknowledgedAt" TIMESTAMP(3),
    "complianceChecklistAcknowledgedByName" TEXT,
    "complianceChecklistAcknowledgedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gp_practices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialists" (
    "id" TEXT NOT NULL,
    "givenName" TEXT NOT NULL,
    "familyName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "ahpraNumber" TEXT NOT NULL,
    "ahpraVerificationStatus" TEXT NOT NULL DEFAULT 'pending',
    "specialty" TEXT,
    "registrationStatus" TEXT,
    "hpiI" TEXT,
    "hpiIResolutionStatus" TEXT NOT NULL DEFAULT 'pending',
    "nashCredentialId" TEXT,
    "nashCredentialStatus" TEXT NOT NULL DEFAULT 'pending',
    "directoryProfileId" TEXT,
    "directoryProfileStatus" TEXT NOT NULL DEFAULT 'pending',
    "econsultOptIn" BOOLEAN NOT NULL DEFAULT false,
    "econsultOptInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "specialists_pkey" PRIMARY KEY ("id")
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
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "audit_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patients_ihi_key" ON "patients"("ihi");

-- CreateIndex
CREATE INDEX "patients_mobileNumber_idx" ON "patients"("mobileNumber");

-- CreateIndex
CREATE INDEX "patients_email_idx" ON "patients"("email");

-- CreateIndex
CREATE INDEX "patients_status_idx" ON "patients"("status");

-- CreateIndex
CREATE UNIQUE INDEX "account_activation_requests_tokenHash_key" ON "account_activation_requests"("tokenHash");

-- CreateIndex
CREATE INDEX "account_activation_requests_patientId_idx" ON "account_activation_requests"("patientId");

-- CreateIndex
CREATE INDEX "account_activation_requests_status_idx" ON "account_activation_requests"("status");

-- CreateIndex
CREATE INDEX "account_activation_requests_triggeringGpId_idx" ON "account_activation_requests"("triggeringGpId");

-- CreateIndex
CREATE UNIQUE INDEX "carers_activationRequestId_key" ON "carers"("activationRequestId");

-- CreateIndex
CREATE INDEX "carers_patientId_idx" ON "carers"("patientId");

-- CreateIndex
CREATE INDEX "carers_email_idx" ON "carers"("email");

-- CreateIndex
CREATE INDEX "carers_ownMobileNumber_idx" ON "carers"("ownMobileNumber");

-- CreateIndex
CREATE INDEX "otp_challenges_activationRequestId_idx" ON "otp_challenges"("activationRequestId");

-- CreateIndex
CREATE INDEX "otp_challenges_expiresAt_idx" ON "otp_challenges"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "gp_practices_hpiO_key" ON "gp_practices"("hpiO");

-- CreateIndex
CREATE INDEX "gp_practices_verificationStatus_idx" ON "gp_practices"("verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "specialists_ahpraNumber_key" ON "specialists"("ahpraNumber");

-- CreateIndex
CREATE UNIQUE INDEX "specialists_hpiI_key" ON "specialists"("hpiI");

-- CreateIndex
CREATE INDEX "specialists_ahpraVerificationStatus_idx" ON "specialists"("ahpraVerificationStatus");

-- CreateIndex
CREATE INDEX "audit_outbox_publishedAt_idx" ON "audit_outbox"("publishedAt");

-- AddForeignKey
ALTER TABLE "account_activation_requests" ADD CONSTRAINT "account_activation_requests_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carers" ADD CONSTRAINT "carers_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carers" ADD CONSTRAINT "carers_activationRequestId_fkey" FOREIGN KEY ("activationRequestId") REFERENCES "account_activation_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_activationRequestId_fkey" FOREIGN KEY ("activationRequestId") REFERENCES "account_activation_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
