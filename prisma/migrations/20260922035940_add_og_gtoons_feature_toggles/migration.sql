-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "ogGtoonsDeckBuildingEnabled" BOOLEAN DEFAULT true,
ADD COLUMN     "ogGtoonsGameEnabled" BOOLEAN DEFAULT true,
ADD COLUMN     "ogGtoonsLeaderboardEnabled" BOOLEAN DEFAULT true,
ADD COLUMN     "ogGtoonsMatchmakingEnabled" BOOLEAN DEFAULT true;
