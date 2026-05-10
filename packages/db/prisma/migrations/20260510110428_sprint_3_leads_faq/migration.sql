-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('PROPERTY_DETAIL', 'AGENCY_PAGE', 'AGENT_PAGE', 'LOCATION_LANDING', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'DISQUALIFIED', 'CLOSED');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "source" "LeadSource" NOT NULL DEFAULT 'PROPERTY_DETAIL',
    "propertyId" TEXT,
    "agencyId" TEXT,
    "name" TEXT NOT NULL,
    "email" CITEXT,
    "phone" TEXT,
    "message" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "ipHash" TEXT,
    "userAgent" TEXT,
    "turnstileVerified" BOOLEAN NOT NULL DEFAULT false,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "contactedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationFAQ" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationFAQ_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_propertyId_createdAt_idx" ON "Lead"("propertyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Lead_agencyId_status_createdAt_idx" ON "Lead"("agencyId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Lead_status_createdAt_idx" ON "Lead"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Lead_createdAt_id_idx" ON "Lead"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "LocationFAQ_locationId_locale_position_idx" ON "LocationFAQ"("locationId", "locale", "position");

-- CreateIndex
CREATE UNIQUE INDEX "LocationFAQ_locationId_locale_position_key" ON "LocationFAQ"("locationId", "locale", "position");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationFAQ" ADD CONSTRAINT "LocationFAQ_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
