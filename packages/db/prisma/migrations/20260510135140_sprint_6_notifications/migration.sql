-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('VIEWING_REQUESTED', 'VIEWING_ACCEPTED', 'VIEWING_DECLINED', 'VIEWING_RESCHEDULED', 'VIEWING_CANCELLED', 'VIEWING_EXPIRING_SOON', 'VIEWING_OUTCOME_SET', 'DEAL_SUBMITTED', 'DEAL_CONFIRMED', 'DEAL_DISPUTED', 'DEAL_DISPUTE_RESOLVED', 'CHAT_MESSAGE', 'LEAD_RECEIVED', 'IMPORT_FAILED');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "targetKind" TEXT,
    "targetId" TEXT,
    "payload" JSONB,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_id_idx" ON "Notification"("userId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_emailedAt_createdAt_idx" ON "Notification"("emailedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
