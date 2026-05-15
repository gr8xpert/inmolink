-- Tenant-scope the import-dedup unique on Property.
-- Old: UNIQUE (source, externalRef) — let one agency overwrite another's
--      property if both imported the same source+ref.
-- New: UNIQUE (ownerAgencyId, source, externalRef) — re-imports stay
--      idempotent per agency while cross-agency collisions are impossible.

ALTER TABLE "Property" DROP CONSTRAINT IF EXISTS "Property_source_externalRef_key";

CREATE UNIQUE INDEX "Property_ownerAgencyId_source_externalRef_key"
  ON "Property" ("ownerAgencyId", "source", "externalRef");
