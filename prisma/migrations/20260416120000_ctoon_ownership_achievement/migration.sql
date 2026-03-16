-- CreateTable
CREATE TABLE "AchievementRequiredCtoon" (
    "id" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,

    CONSTRAINT "AchievementRequiredCtoon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AchievementRequiredCtoon_ctoonId_idx" ON "AchievementRequiredCtoon"("ctoonId");

-- CreateIndex
CREATE UNIQUE INDEX "AchievementRequiredCtoon_achievementId_ctoonId_key" ON "AchievementRequiredCtoon"("achievementId", "ctoonId");

-- AddForeignKey
ALTER TABLE "AchievementRequiredCtoon" ADD CONSTRAINT "AchievementRequiredCtoon_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementRequiredCtoon" ADD CONSTRAINT "AchievementRequiredCtoon_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
