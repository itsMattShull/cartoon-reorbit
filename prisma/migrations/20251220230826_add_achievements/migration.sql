-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imagePath" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "pointsGte" INTEGER,
    "totalCtoonsGte" INTEGER,
    "uniqueCtoonsGte" INTEGER,
    "setsRequired" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AchievementUser" (
    "id" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AchievementUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AchievementReward" (
    "id" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "points" INTEGER,

    CONSTRAINT "AchievementReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AchievementRewardCtoon" (
    "id" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AchievementRewardCtoon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AchievementRewardBackground" (
    "id" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "backgroundId" TEXT NOT NULL,

    CONSTRAINT "AchievementRewardBackground_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_slug_key" ON "Achievement"("slug");

-- CreateIndex
CREATE INDEX "AchievementUser_userId_achievedAt_idx" ON "AchievementUser"("userId", "achievedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AchievementUser_achievementId_userId_key" ON "AchievementUser"("achievementId", "userId");

-- CreateIndex
CREATE INDEX "AchievementRewardCtoon_ctoonId_idx" ON "AchievementRewardCtoon"("ctoonId");

-- CreateIndex
CREATE UNIQUE INDEX "AchievementRewardCtoon_rewardId_ctoonId_key" ON "AchievementRewardCtoon"("rewardId", "ctoonId");

-- CreateIndex
CREATE INDEX "AchievementRewardBackground_backgroundId_idx" ON "AchievementRewardBackground"("backgroundId");

-- CreateIndex
CREATE UNIQUE INDEX "AchievementRewardBackground_rewardId_backgroundId_key" ON "AchievementRewardBackground"("rewardId", "backgroundId");

-- AddForeignKey
ALTER TABLE "AchievementUser" ADD CONSTRAINT "AchievementUser_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementUser" ADD CONSTRAINT "AchievementUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementReward" ADD CONSTRAINT "AchievementReward_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementRewardCtoon" ADD CONSTRAINT "AchievementRewardCtoon_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "AchievementReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementRewardCtoon" ADD CONSTRAINT "AchievementRewardCtoon_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementRewardBackground" ADD CONSTRAINT "AchievementRewardBackground_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "AchievementReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementRewardBackground" ADD CONSTRAINT "AchievementRewardBackground_backgroundId_fkey" FOREIGN KEY ("backgroundId") REFERENCES "Background"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
