-- AlterTable
ALTER TABLE "Agency" ADD COLUMN     "billingEmail" TEXT,
ADD COLUMN     "taxIdValidated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vatCountryCode" TEXT,
ADD COLUMN     "vatNumber" TEXT;
