-- Achievement criterion: lifetime OG gToons PvP wins (see Achievement.ogGtoonsWinsGte).
-- Nullable with no default, so this is a metadata-only change: no table rewrite, existing
-- achievements are unaffected (null = criterion not used).

-- AlterTable
ALTER TABLE "Achievement" ADD COLUMN "ogGtoonsWinsGte" INTEGER;
