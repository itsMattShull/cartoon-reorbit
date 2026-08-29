-- AlterTable
ALTER TABLE "User" ADD COLUMN     "equippedGlowCMoonId" TEXT;

-- AlterTable
ALTER TABLE "UserBackground" ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "CMoonAffinityLevel" (
    "id" TEXT NOT NULL,
    "cMoonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "grantsGlow" BOOLEAN NOT NULL DEFAULT false,
    "rewardBackgroundId" TEXT,
    "rewardAvatarId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonAffinityLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonAffinity" (
    "userId" TEXT NOT NULL,
    "cMoonId" TEXT NOT NULL,
    "affinitySpent" INTEGER NOT NULL DEFAULT 0,
    "currentLevelId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonAffinity_pkey" PRIMARY KEY ("userId","cMoonId")
);

-- CreateTable
CREATE TABLE "UserCMoonGlow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cMoonId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCMoonGlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Avatar" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "filename" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "Avatar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAvatar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "avatarId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,

    CONSTRAINT "UserAvatar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CMoonAffinityLevel_cMoonId_threshold_key" ON "CMoonAffinityLevel"("cMoonId", "threshold");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonAffinityLevel_cMoonId_sortOrder_key" ON "CMoonAffinityLevel"("cMoonId", "sortOrder");

-- CreateIndex
CREATE INDEX "CMoonAffinity_cMoonId_affinitySpent_idx" ON "CMoonAffinity"("cMoonId", "affinitySpent");

-- CreateIndex
CREATE UNIQUE INDEX "UserCMoonGlow_userId_cMoonId_key" ON "UserCMoonGlow"("userId", "cMoonId");

-- CreateIndex
CREATE UNIQUE INDEX "Avatar_filename_key" ON "Avatar"("filename");

-- CreateIndex
CREATE INDEX "Avatar_createdAt_idx" ON "Avatar"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserAvatar_userId_avatarId_key" ON "UserAvatar"("userId", "avatarId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_equippedGlowCMoonId_fkey" FOREIGN KEY ("equippedGlowCMoonId") REFERENCES "CMoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonAffinityLevel" ADD CONSTRAINT "CMoonAffinityLevel_cMoonId_fkey" FOREIGN KEY ("cMoonId") REFERENCES "CMoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonAffinityLevel" ADD CONSTRAINT "CMoonAffinityLevel_rewardBackgroundId_fkey" FOREIGN KEY ("rewardBackgroundId") REFERENCES "Background"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonAffinityLevel" ADD CONSTRAINT "CMoonAffinityLevel_rewardAvatarId_fkey" FOREIGN KEY ("rewardAvatarId") REFERENCES "Avatar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonAffinity" ADD CONSTRAINT "CMoonAffinity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonAffinity" ADD CONSTRAINT "CMoonAffinity_cMoonId_fkey" FOREIGN KEY ("cMoonId") REFERENCES "CMoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonAffinity" ADD CONSTRAINT "CMoonAffinity_currentLevelId_fkey" FOREIGN KEY ("currentLevelId") REFERENCES "CMoonAffinityLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCMoonGlow" ADD CONSTRAINT "UserCMoonGlow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCMoonGlow" ADD CONSTRAINT "UserCMoonGlow_cMoonId_fkey" FOREIGN KEY ("cMoonId") REFERENCES "CMoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avatar" ADD CONSTRAINT "Avatar_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAvatar" ADD CONSTRAINT "UserAvatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAvatar" ADD CONSTRAINT "UserAvatar_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "Avatar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
