-- AlterTable
ALTER TABLE "EmailCampaignRecipient" ADD COLUMN     "context" JSONB;

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "tags" TEXT[],
    "source" TEXT,
    "notes" TEXT,
    "consentGivenAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_agencyId_createdAt_id_idx" ON "Contact"("agencyId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Contact_agencyId_email_key" ON "Contact"("agencyId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "EmailCampaignRecipient_campaignId_email_key" ON "EmailCampaignRecipient"("campaignId", "email");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
