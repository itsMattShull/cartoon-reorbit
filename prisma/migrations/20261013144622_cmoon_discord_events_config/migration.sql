-- AlterTable
ALTER TABLE "CMoonEnemyMember" ADD COLUMN     "lastFinalBossPingAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CMoonSeasonConfig" ADD COLUMN     "enemiesDefeatedGoalAnnouncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "cMoonFinalBossPingCooldownMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "cMoonFinalBossPingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cMoonRankUpAnnounceEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cMoonSeasonMvpRecapEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cMoonTeamMilestoneEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cMoonTeamMilestoneEnemiesInterval" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "cMoonTeamMilestonePointsInterval" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "cMoonWeeklyRecapDayOfWeek" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cMoonWeeklyRecapEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cMoonWeeklyRecapHour" INTEGER NOT NULL DEFAULT 9,
ADD COLUMN     "cMoonWeeklyRecapLastPostedFor" TEXT,
ADD COLUMN     "cMoonWeeklyRecapMinute" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cMoonWelcomePostEnabled" BOOLEAN NOT NULL DEFAULT false;
