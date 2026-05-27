-- Migration applied to DB but file was missing from repo — recreated as baseline.
-- Removes deprecated GlobalGameConfig columns and LottoLog index that were
-- already dropped from schema.prisma before this migration was generated.

ALTER TABLE "GlobalGameConfig" DROP COLUMN IF EXISTS "featuredAuctionsPerDay",
DROP COLUMN IF EXISTS "firstAdditionalCzoneCost",
DROP COLUMN IF EXISTS "subsequentAdditionalCzoneCost";

DROP INDEX IF EXISTS "LottoLog_userCtoonId_idx";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserIP_userId_idx" ON "UserIP"("userId");
