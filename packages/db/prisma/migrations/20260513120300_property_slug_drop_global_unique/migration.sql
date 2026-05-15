-- Drop the global UNIQUE on (locale, slug) — public URLs resolve by slugId
-- (slug + id suffix) so cross-agency duplicates are safe. Keep the index for
-- query speed.

ALTER TABLE "PropertyTranslation" DROP CONSTRAINT IF EXISTS "PropertyTranslation_locale_slug_key";
DROP INDEX IF EXISTS "PropertyTranslation_locale_slug_key";

CREATE INDEX IF NOT EXISTS "PropertyTranslation_locale_slug_idx"
  ON "PropertyTranslation" ("locale", "slug");
