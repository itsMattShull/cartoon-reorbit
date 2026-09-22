-- The og gToons feature is still being rolled out, so its visibility switches should default to
-- off until an admin explicitly turns each one on, rather than defaulting to on like the other
-- games' toggles.
ALTER TABLE "GameConfig" ALTER COLUMN "ogGtoonsMatchmakingEnabled" SET DEFAULT false;
ALTER TABLE "GameConfig" ALTER COLUMN "ogGtoonsGameEnabled" SET DEFAULT false;
ALTER TABLE "GameConfig" ALTER COLUMN "ogGtoonsDeckBuildingEnabled" SET DEFAULT false;
ALTER TABLE "GameConfig" ALTER COLUMN "ogGtoonsLeaderboardEnabled" SET DEFAULT false;

-- Changing the column default only affects rows inserted after this point. The "OgGtoons" row
-- itself was never reachable before this feature's GET handler bug was fixed (see
-- 20260922035940_add_og_gtoons_feature_toggles), so no admin could have created or toggled it
-- yet — this just brings any row created in that narrow window in line with the new default.
UPDATE "GameConfig"
SET "ogGtoonsMatchmakingEnabled" = false,
    "ogGtoonsGameEnabled" = false,
    "ogGtoonsDeckBuildingEnabled" = false,
    "ogGtoonsLeaderboardEnabled" = false
WHERE "gameName" = 'OgGtoons';
