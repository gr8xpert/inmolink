-- ChatThread uniqueness: split DIRECT vs VIEWING.
-- Old: UNIQUE (kind, userMin, userMax) — blocked any second VIEWING thread
--      between the same two users (e.g. a second accepted viewing request
--      between the same owner/introducer fails on insert).
-- New: PARTIAL UNIQUE (userMin, userMax) WHERE kind = 'DIRECT' — only the
--      free-form direct thread is deduplicated; viewing threads are
--      identified by their viewingRequestId 1:1 relation.

ALTER TABLE "ChatThread" DROP CONSTRAINT IF EXISTS "ChatThread_kind_userMin_userMax_key";
DROP INDEX IF EXISTS "ChatThread_kind_userMin_userMax_key";

CREATE UNIQUE INDEX "ChatThread_direct_userMin_userMax_key"
  ON "ChatThread" ("userMin", "userMax")
  WHERE "kind" = 'DIRECT';
