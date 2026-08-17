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
CREATE INDEX "audit_outbox_publishedAt_idx" ON "audit_outbox"("publishedAt");
