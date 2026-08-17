-- Audit outbox retry policy: exponential backoff, no permanent give-up.
-- See BUILD_LOG/local-build-fixes.md, "Audit outbox retry policy".
ALTER TABLE "audit_outbox"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "audit_outbox_nextAttemptAt_idx" ON "audit_outbox"("nextAttemptAt");
