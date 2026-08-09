-- CreateTable
CREATE TABLE "GameWeeklyPrizeConfig" (
    "id" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "fallbackPoints" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastDistributedFor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameWeeklyPrizeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameWeeklyPrizeDistribution" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "winnerUserId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "ctoonId" TEXT,
    "pointsAwarded" INTEGER,
    "wasRepeatWinner" BOOLEAN NOT NULL DEFAULT false,
    "distributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameWeeklyPrizeDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameWeeklyPrizeConfig_game_key" ON "GameWeeklyPrizeConfig"("game");

-- CreateIndex
CREATE INDEX "GameWeeklyPrizeDistribution_configId_winnerUserId_ctoonId_idx" ON "GameWeeklyPrizeDistribution"("configId", "winnerUserId", "ctoonId");

-- CreateIndex
CREATE INDEX "GameWeeklyPrizeDistribution_configId_distributedAt_idx" ON "GameWeeklyPrizeDistribution"("configId", "distributedAt");

-- CreateIndex
CREATE INDEX "GameWeeklyPrizeDistribution_game_weekStart_idx" ON "GameWeeklyPrizeDistribution"("game", "weekStart");

-- AddForeignKey
ALTER TABLE "GameWeeklyPrizeConfig" ADD CONSTRAINT "GameWeeklyPrizeConfig_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameWeeklyPrizeDistribution" ADD CONSTRAINT "GameWeeklyPrizeDistribution_configId_fkey" FOREIGN KEY ("configId") REFERENCES "GameWeeklyPrizeConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameWeeklyPrizeDistribution" ADD CONSTRAINT "GameWeeklyPrizeDistribution_winnerUserId_fkey" FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameWeeklyPrizeDistribution" ADD CONSTRAINT "GameWeeklyPrizeDistribution_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
