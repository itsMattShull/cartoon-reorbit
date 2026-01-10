-- CreateEnum
CREATE TYPE "ScavengerResultType" AS ENUM ('NOTHING', 'POINTS', 'EXCLUSIVE_CTOON');

-- CreateEnum
CREATE TYPE "ScavengerSessionStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED');

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "scavengerChancePercent" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "scavengerCooldownHours" INTEGER NOT NULL DEFAULT 24;

-- CreateTable
CREATE TABLE "ScavengerStory" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScavengerStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScavengerStep" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "imagePath" TEXT,
    "optionAText" TEXT NOT NULL,
    "optionBText" TEXT NOT NULL,

    CONSTRAINT "ScavengerStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScavengerOutcome" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "resultType" "ScavengerResultType" NOT NULL,
    "points" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScavengerOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScavengerExclusiveCtoon" (
    "id" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScavengerExclusiveCtoon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScavengerSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL DEFAULT 1,
    "path" TEXT NOT NULL DEFAULT '',
    "status" "ScavengerSessionStatus" NOT NULL DEFAULT 'PENDING',
    "triggerSource" TEXT NOT NULL,
    "resultType" "ScavengerResultType",
    "pointsAwarded" INTEGER,
    "ctoonIdAwarded" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScavengerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScavengerTriggerLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "triggerSource" TEXT NOT NULL,
    "started" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScavengerTriggerLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScavengerStep_storyId_index_key" ON "ScavengerStep"("storyId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "ScavengerOutcome_storyId_path_key" ON "ScavengerOutcome"("storyId", "path");

-- CreateIndex
CREATE UNIQUE INDEX "ScavengerExclusiveCtoon_ctoonId_key" ON "ScavengerExclusiveCtoon"("ctoonId");

-- CreateIndex
CREATE INDEX "ScavengerExclusiveCtoon_ctoonId_idx" ON "ScavengerExclusiveCtoon"("ctoonId");

-- CreateIndex
CREATE INDEX "ScavengerSession_userId_createdAt_idx" ON "ScavengerSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ScavengerSession_status_idx" ON "ScavengerSession"("status");

-- CreateIndex
CREATE INDEX "ScavengerTriggerLog_createdAt_idx" ON "ScavengerTriggerLog"("createdAt");

-- CreateIndex
CREATE INDEX "ScavengerTriggerLog_triggerSource_createdAt_idx" ON "ScavengerTriggerLog"("triggerSource", "createdAt");

-- AddForeignKey
ALTER TABLE "ScavengerStep" ADD CONSTRAINT "ScavengerStep_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "ScavengerStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScavengerOutcome" ADD CONSTRAINT "ScavengerOutcome_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "ScavengerStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScavengerExclusiveCtoon" ADD CONSTRAINT "ScavengerExclusiveCtoon_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScavengerSession" ADD CONSTRAINT "ScavengerSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScavengerSession" ADD CONSTRAINT "ScavengerSession_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "ScavengerStory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScavengerSession" ADD CONSTRAINT "ScavengerSession_ctoonIdAwarded_fkey" FOREIGN KEY ("ctoonIdAwarded") REFERENCES "Ctoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScavengerTriggerLog" ADD CONSTRAINT "ScavengerTriggerLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
