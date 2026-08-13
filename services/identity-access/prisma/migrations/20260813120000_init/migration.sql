-- CreateTable
CREATE TABLE "AccountLinkRequest" (
    "id" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "principalType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "AccountLinkRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountLinkRequest_nonce_key" ON "AccountLinkRequest"("nonce");

-- CreateIndex
CREATE INDEX "AccountLinkRequest_principalId_idx" ON "AccountLinkRequest"("principalId");

-- CreateIndex
CREATE INDEX "AccountLinkRequest_expiresAt_idx" ON "AccountLinkRequest"("expiresAt");
