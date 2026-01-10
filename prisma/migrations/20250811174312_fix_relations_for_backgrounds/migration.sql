-- CreateEnum
CREATE TYPE "BackgroundVisibility" AS ENUM ('PUBLIC', 'CODE_ONLY');

-- CreateTable
CREATE TABLE "Background" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "imagePath" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "visibility" "BackgroundVisibility" NOT NULL DEFAULT 'PUBLIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "Background_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardBackground" (
    "id" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "backgroundId" TEXT NOT NULL,

    CONSTRAINT "RewardBackground_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBackground" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "backgroundId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceCodeId" TEXT,

    CONSTRAINT "UserBackground_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Background_filename_key" ON "Background"("filename");

-- CreateIndex
CREATE INDEX "Background_createdAt_idx" ON "Background"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RewardBackground_rewardId_backgroundId_key" ON "RewardBackground"("rewardId", "backgroundId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBackground_userId_backgroundId_key" ON "UserBackground"("userId", "backgroundId");

-- AddForeignKey
ALTER TABLE "Background" ADD CONSTRAINT "Background_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardBackground" ADD CONSTRAINT "RewardBackground_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "ClaimCodeReward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardBackground" ADD CONSTRAINT "RewardBackground_backgroundId_fkey" FOREIGN KEY ("backgroundId") REFERENCES "Background"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBackground" ADD CONSTRAINT "UserBackground_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBackground" ADD CONSTRAINT "UserBackground_backgroundId_fkey" FOREIGN KEY ("backgroundId") REFERENCES "Background"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBackground" ADD CONSTRAINT "UserBackground_sourceCodeId_fkey" FOREIGN KEY ("sourceCodeId") REFERENCES "ClaimCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
