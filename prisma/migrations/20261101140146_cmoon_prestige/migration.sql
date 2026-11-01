-- AlterTable
ALTER TABLE "CMoon" ADD COLUMN     "isPrestigeCMoon" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "cMoonPrestigeEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastPrestigedAt" TIMESTAMP(3),
ADD COLUMN     "prestigeLevel" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CMoonPrestigeLevel" (
    "id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "pointThreshold" INTEGER NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonPrestigeLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonPrestigeLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromCMoonId" TEXT,
    "toCMoonId" TEXT,
    "level" INTEGER NOT NULL,
    "fromCMoonName" TEXT,
    "toCMoonName" TEXT NOT NULL,
    "pointsAtPrestige" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CMoonPrestigeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CMoonPrestigeLevel_level_key" ON "CMoonPrestigeLevel"("level");

-- CreateIndex
CREATE INDEX "CMoonPrestigeLevel_level_idx" ON "CMoonPrestigeLevel"("level");

-- CreateIndex
CREATE INDEX "CMoonPrestigeLog_userId_idx" ON "CMoonPrestigeLog"("userId");

-- CreateIndex
CREATE INDEX "CMoonPrestigeLog_createdAt_idx" ON "CMoonPrestigeLog"("createdAt");

-- AddForeignKey
ALTER TABLE "CMoonPrestigeLog" ADD CONSTRAINT "CMoonPrestigeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPrestigeLog" ADD CONSTRAINT "CMoonPrestigeLog_fromCMoonId_fkey" FOREIGN KEY ("fromCMoonId") REFERENCES "CMoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPrestigeLog" ADD CONSTRAINT "CMoonPrestigeLog_toCMoonId_fkey" FOREIGN KEY ("toCMoonId") REFERENCES "CMoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
