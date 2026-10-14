-- CreateTable
CREATE TABLE "AchievementTierClaimDismissal" (
    "id" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AchievementTierClaimDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AchievementTierClaimDismissal_userId_idx" ON "AchievementTierClaimDismissal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AchievementTierClaimDismissal_achievementId_userId_key" ON "AchievementTierClaimDismissal"("achievementId", "userId");

-- AddForeignKey
ALTER TABLE "AchievementTierClaimDismissal" ADD CONSTRAINT "AchievementTierClaimDismissal_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementTierClaimDismissal" ADD CONSTRAINT "AchievementTierClaimDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
