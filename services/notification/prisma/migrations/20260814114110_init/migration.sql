-- CreateTable
CREATE TABLE "push_device_token" (
    "id" TEXT NOT NULL,
    "principalType" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_device_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_log" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "recipientAddress" TEXT,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "error" TEXT,
    "dispatchGroupId" TEXT,
    "attemptSequence" INTEGER NOT NULL DEFAULT 1,
    "referralId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_thread" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdByType" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByType" TEXT,
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_thread_participant" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "principalType" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "displayName" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_thread_participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_thread_message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderDisplayName" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_thread_message_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "push_device_token_token_key" ON "push_device_token"("token");

-- CreateIndex
CREATE INDEX "push_device_token_principalType_principalId_idx" ON "push_device_token"("principalType", "principalId");

-- CreateIndex
CREATE INDEX "notification_log_recipientType_recipientId_idx" ON "notification_log"("recipientType", "recipientId");

-- CreateIndex
CREATE INDEX "notification_log_channel_status_idx" ON "notification_log"("channel", "status");

-- CreateIndex
CREATE INDEX "notification_log_dispatchGroupId_idx" ON "notification_log"("dispatchGroupId");

-- CreateIndex
CREATE INDEX "notification_log_referralId_idx" ON "notification_log"("referralId");

-- CreateIndex
CREATE UNIQUE INDEX "message_thread_referralId_key" ON "message_thread"("referralId");

-- CreateIndex
CREATE INDEX "message_thread_participant_threadId_idx" ON "message_thread_participant"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "message_thread_participant_threadId_principalType_principal_key" ON "message_thread_participant"("threadId", "principalType", "principalId");

-- CreateIndex
CREATE INDEX "message_thread_message_threadId_createdAt_idx" ON "message_thread_message"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_outbox_publishedAt_idx" ON "audit_outbox"("publishedAt");

-- AddForeignKey
ALTER TABLE "message_thread_participant" ADD CONSTRAINT "message_thread_participant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "message_thread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_thread_message" ADD CONSTRAINT "message_thread_message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "message_thread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
