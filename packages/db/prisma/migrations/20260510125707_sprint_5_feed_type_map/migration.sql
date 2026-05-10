-- CreateTable
CREATE TABLE "FeedTypeMap" (
    "id" TEXT NOT NULL,
    "kind" "FeedConnectorKind" NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "propertyTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedTypeMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedTypeMap_propertyTypeId_idx" ON "FeedTypeMap"("propertyTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedTypeMap_kind_sourceLabel_key" ON "FeedTypeMap"("kind", "sourceLabel");

-- AddForeignKey
ALTER TABLE "FeedTypeMap" ADD CONSTRAINT "FeedTypeMap_propertyTypeId_fkey" FOREIGN KEY ("propertyTypeId") REFERENCES "PropertyType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
