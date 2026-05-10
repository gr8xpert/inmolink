-- DropForeignKey
ALTER TABLE "MediaVariant" DROP CONSTRAINT "MediaVariant_sourceMediaObjectId_fkey";

-- AlterTable
ALTER TABLE "MediaObject" ALTER COLUMN "refCount" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "MediaVariant" ADD COLUMN     "scheduledDeleteAt" TIMESTAMP(3),
ALTER COLUMN "sourceMediaObjectId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "MediaVariant_scheduledDeleteAt_idx" ON "MediaVariant"("scheduledDeleteAt");

-- AddForeignKey
ALTER TABLE "MediaVariant" ADD CONSTRAINT "MediaVariant_sourceMediaObjectId_fkey" FOREIGN KEY ("sourceMediaObjectId") REFERENCES "MediaObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
