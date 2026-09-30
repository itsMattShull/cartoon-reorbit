-- CreateEnum
CREATE TYPE "CMoonEnemyRank" AS ENUM ('GOON', 'ENFORCER', 'UNDERBOSS', 'FINAL_BOSS');

-- AlterTable
ALTER TABLE "CMoonEnemyMember" ADD COLUMN     "rank" "CMoonEnemyRank" NOT NULL DEFAULT 'GOON';

-- AlterTable
ALTER TABLE "Achievement" ADD COLUMN     "cmoonGoonsDefeatedGte" INTEGER,
ADD COLUMN     "cmoonEnforcersDefeatedGte" INTEGER,
ADD COLUMN     "cmoonUnderbossesDefeatedGte" INTEGER,
ADD COLUMN     "cmoonFinalBossesDefeatedGte" INTEGER;

-- AlterTable: cMoon Enemy Battles are now open to players with no cMoon — cMoonId is a nullable
-- snapshot rather than a required one (see the model's own schema comment).
ALTER TABLE "CMoonEnemyBattle" ALTER COLUMN "cMoonId" DROP NOT NULL;
